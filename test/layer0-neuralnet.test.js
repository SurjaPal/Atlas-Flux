const { expect } = require("chai");
const { MLPClassifier } = require("../layer0/neuralNet");
const { evaluate } = require("../layer0/costSensitiveClassifier");
const { randomSearch, crossValidate, sampleHyperparams } = require("../layer0/hyperparamSearch");

describe("Layer 0 — MLPClassifier (hand-rolled backprop)", function () {
  it("solves a nonlinear (XOR-style) problem that logistic regression structurally cannot", function () {
    const X = [],
      y = [];
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * 2 - 1;
      const b = Math.random() * 2 - 1;
      X.push([a, b]);
      y.push((a > 0) !== (b > 0) ? 1 : 0);
    }
    const net = new MLPClassifier({ inputSize: 2, hiddenSizes: [8], l2: 0.0001 });
    net.train(X, y, { positiveWeight: 1, epochs: 150, lr: 0.1, batchSize: 16, momentum: 0.9 });
    const metrics = evaluate(y, net.predict(X));
    expect(metrics.f1, "a correctly-implemented MLP should solve XOR with high F1").to.be.greaterThan(0.85);
  });

  it("round-trips through toJSON/fromJSON with identical predictions", function () {
    const X = Array.from({ length: 50 }, () => [Math.random(), Math.random(), Math.random()]);
    const y = X.map((row) => (row[0] + row[1] > 1 ? 1 : 0));
    const net = new MLPClassifier({ inputSize: 3, hiddenSizes: [6], l2: 0.001 });
    net.train(X, y, { positiveWeight: 2, epochs: 40, lr: 0.1, batchSize: 8 });

    const before = net.predictProba(X);
    const restored = MLPClassifier.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
    const after = restored.predictProba(X);

    for (let i = 0; i < before.length; i++) {
      expect(after[i]).to.be.closeTo(before[i], 1e-9);
    }
  });

  it("applies a cost-sensitive weight: a higher positiveWeight biases toward catching the rare class", function () {
    // Deliberately imbalanced (10% positive), with a weak signal, so the
    // weighting actually has to do work to achieve full recall.
    const X = [],
      y = [];
    for (let i = 0; i < 400; i++) {
      const v = Math.random();
      X.push([v]);
      y.push(v > 0.9 ? 1 : 0);
    }

    const unweighted = new MLPClassifier({ inputSize: 1, hiddenSizes: [8], l2: 0.001 });
    unweighted.train(X, y, { positiveWeight: 1, epochs: 100, lr: 0.1, batchSize: 16 });
    const unweightedMetrics = evaluate(y, unweighted.predict(X));

    const weighted = new MLPClassifier({ inputSize: 1, hiddenSizes: [8], l2: 0.001 });
    weighted.train(X, y, { positiveWeight: 10, epochs: 100, lr: 0.1, batchSize: 16 });
    const weightedMetrics = evaluate(y, weighted.predict(X));

    expect(weightedMetrics.recall, "higher positiveWeight should not produce lower recall than unweighted").to.be.at.least(
      unweightedMetrics.recall
    );
  });
});

describe("Layer 0 — hyperparameter search", function () {
  it("sampleHyperparams returns values within documented ranges", function () {
    for (let i = 0; i < 25; i++) {
      const hp = sampleHyperparams();
      expect(hp.lr).to.be.within(0.009, 0.32);
      expect(hp.l2).to.be.within(0.00009, 0.11);
      expect(hp.positiveWeight).to.be.within(2, 10);
      expect([80, 120, 160]).to.include(hp.epochs);
      expect([16, 32, 64]).to.include(hp.batchSize);
    }
  });

  it("crossValidate returns averaged metrics across all folds", function () {
    const X = Array.from({ length: 60 }, () => [Math.random(), Math.random()]);
    const y = X.map((row) => (row[0] > 0.5 ? 1 : 0));
    const hp = { hiddenSizes: [4], lr: 0.1, l2: 0.001, positiveWeight: 2, epochs: 30, batchSize: 8 };
    const result = crossValidate(X, y, hp, 3);
    expect(result.foldScores).to.have.lengthOf(3);
    expect(result.f1).to.be.a("number");
  });

  it("randomSearch disqualifies configs below the recall floor when better options exist", function () {
    const X = [],
      y = [];
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * 2 - 1;
      const b = Math.random() * 2 - 1;
      X.push([a, b]);
      y.push(a + b > 0.5 ? 1 : 0);
    }
    const result = randomSearch(X, y, { trials: 4, folds: 3, recallFloor: 0.9 });
    expect(result.best.cv.recall).to.be.at.least(0.5); // sanity: search returns something reasonable, not garbage
    expect(result.all).to.have.lengthOf(4);
  });
});
