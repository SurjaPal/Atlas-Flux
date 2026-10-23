// layer0/hyperparamSearch.js
//
// Random search + k-fold cross-validation over the MLP's hyperparameters.
// Random search is used deliberately over grid search: Bergstra & Bengio
// (2012, JMLR) showed random search finds comparably good configurations
// with far fewer trials than grid search when only a few hyperparameters
// actually matter — true here too (positiveWeight and lr matter much more
// than batchSize, so a grid wastes most of its trials varying the
// low-impact ones).
//
// Selection metric: F1, subject to a recall floor. This is a security
// detector — a missed attack (false negative) is categorically worse than
// a false alarm, so a config with high precision but recall below the
// floor is disqualified outright, not merely penalized.

const { MLPClassifier } = require("./neuralNet");
const { evaluate } = require("./costSensitiveClassifier");

function sampleHyperparams() {
  const hiddenOptions = [[8], [16], [12, 6], [16, 8]];
  return {
    hiddenSizes: hiddenOptions[Math.floor(Math.random() * hiddenOptions.length)],
    lr: Math.pow(10, -2 + Math.random() * 1.5), // ~0.01 .. 0.316, log-uniform (standard practice for learning rate)
    l2: Math.pow(10, -4 + Math.random() * 3), // ~0.0001 .. 0.1, log-uniform
    positiveWeight: 2 + Math.random() * 8, // 2 .. 10
    epochs: [80, 120, 160][Math.floor(Math.random() * 3)],
    batchSize: [16, 32, 64][Math.floor(Math.random() * 3)],
  };
}

function kFoldIndices(n, k) {
  const indices = [...Array(n).keys()].sort(() => Math.random() - 0.5);
  const folds = Array.from({ length: k }, () => []);
  indices.forEach((idx, i) => folds[i % k].push(idx));
  return folds;
}

function crossValidate(X, y, hp, k = 5) {
  const folds = kFoldIndices(X.length, k);
  const scores = [];

  for (let f = 0; f < k; f++) {
    const testIdx = new Set(folds[f]);
    const XTrain = [],
      yTrain = [],
      XVal = [],
      yVal = [];
    for (let i = 0; i < X.length; i++) {
      if (testIdx.has(i)) {
        XVal.push(X[i]);
        yVal.push(y[i]);
      } else {
        XTrain.push(X[i]);
        yTrain.push(y[i]);
      }
    }

    const net = new MLPClassifier({ inputSize: X[0].length, hiddenSizes: hp.hiddenSizes, l2: hp.l2 });
    net.train(XTrain, yTrain, {
      positiveWeight: hp.positiveWeight,
      epochs: hp.epochs,
      lr: hp.lr,
      batchSize: hp.batchSize,
    });
    const pred = net.predict(XVal, 0.5);
    scores.push(evaluate(yVal, pred));
  }

  const avg = (key) => scores.reduce((a, s) => a + s[key], 0) / scores.length;
  return { precision: avg("precision"), recall: avg("recall"), f1: avg("f1"), foldScores: scores };
}

/**
 * @param {number[][]} X
 * @param {number[]} y
 * @param {Object} opts
 * @param {number} opts.trials - number of random configurations to try
 * @param {number} opts.folds - k for k-fold CV
 * @param {number} opts.recallFloor - configs scoring below this recall are disqualified
 */
function randomSearch(X, y, { trials = 20, folds = 5, recallFloor = 0.95 } = {}) {
  const results = [];

  for (let t = 0; t < trials; t++) {
    const hp = sampleHyperparams();
    const cv = crossValidate(X, y, hp, folds);
    results.push({ hp, cv });
    console.log(
      `  [${t + 1}/${trials}] hidden=${JSON.stringify(hp.hiddenSizes)} lr=${hp.lr.toFixed(4)} l2=${hp.l2.toFixed(5)} posW=${hp.positiveWeight.toFixed(2)} epochs=${hp.epochs} batch=${hp.batchSize}  ->  P=${cv.precision.toFixed(3)} R=${cv.recall.toFixed(3)} F1=${cv.f1.toFixed(3)}`
    );
  }

  // Disqualify anything below the recall floor, then rank by F1 among the rest.
  const eligible = results.filter((r) => r.cv.recall >= recallFloor);
  const pool = eligible.length > 0 ? eligible : results; // fall back to best-available if nothing clears the floor
  pool.sort((a, b) => b.cv.f1 - a.cv.f1);

  return { best: pool[0], all: results, metFloor: eligible.length > 0 };
}

module.exports = { sampleHyperparams, crossValidate, randomSearch };
