// layer0/train.js
//
// Run with: node layer0/train.js
//
// Trains and honestly compares two models on the same data:
//   1. CostSensitiveLogisticClassifier — the original baseline
//   2. MLPClassifier — a real neural network, with its hyperparameters
//      chosen by random search + 5-fold cross-validation (not hand-picked)
//
// Whichever wins on the held-out test set (by F1, subject to a recall
// floor — a missed attack is worse than a false alarm) gets saved to
// model.json. Both results are saved to model_comparison.json regardless,
// so the comparison is documented even when the simpler model wins — see
// README.md's Layer 0 section for why that outcome is reported honestly
// rather than hidden.

const fs = require("fs");
const path = require("path");
const { buildDataset, trainTestSplit } = require("./dataset");
const { CostSensitiveLogisticClassifier, evaluate } = require("./costSensitiveClassifier");
const { MLPClassifier } = require("./neuralNet");
const { randomSearch } = require("./hyperparamSearch");

const DECISION_THRESHOLD = 0.7;
const RECALL_FLOOR = 0.95;

function formatMetrics(m) {
  return `precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} f1=${m.f1.toFixed(3)} (tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn})`;
}

function main() {
  console.log("Building synthetic training data across simulated feeders...");
  const { X, y, featureNames } = buildDataset({ numFeeders: 90 });
  const positives = y.filter((v) => v === 1).length;
  console.log(`Dataset: ${X.length} device-window examples, ${positives} positive (attack) (${((positives / X.length) * 100).toFixed(1)}%)`);

  const { XTrain, yTrain, XTest, yTest } = trainTestSplit(X, y, 0.25);
  console.log(`Train: ${XTrain.length}, Test: ${XTest.length}\n`);

  // ---- Baseline: cost-sensitive logistic regression ----
  console.log("=== Baseline: cost-sensitive logistic regression ===");
  const logreg = new CostSensitiveLogisticClassifier({ l2: 0.001 });
  logreg.train(XTrain, yTrain, { positiveWeight: 4, epochs: 500, lr: 0.5 });
  const logregTest = evaluate(yTest, logreg.predict(XTest, DECISION_THRESHOLD));
  console.log("Test:", formatMetrics(logregTest));

  // ---- MLP: random search + 5-fold CV for hyperparameters, then final fit ----
  console.log("\n=== MLP: random search (20 trials) + 5-fold cross-validation ===");
  const search = randomSearch(XTrain, yTrain, { trials: 20, folds: 5, recallFloor: RECALL_FLOOR });
  console.log(
    `\nBest config (by CV F1${search.metFloor ? ", recall floor met" : " — WARNING: no config met the recall floor, using best available"}):`
  );
  console.log(" ", search.best.hp);
  console.log(
    `  CV: P=${search.best.cv.precision.toFixed(3)} R=${search.best.cv.recall.toFixed(3)} F1=${search.best.cv.f1.toFixed(3)}`
  );

  const bestHp = search.best.hp;
  const mlp = new MLPClassifier({ inputSize: XTrain[0].length, hiddenSizes: bestHp.hiddenSizes, l2: bestHp.l2 });
  mlp.train(XTrain, yTrain, {
    positiveWeight: bestHp.positiveWeight,
    epochs: bestHp.epochs,
    lr: bestHp.lr,
    batchSize: bestHp.batchSize,
  });
  const mlpTest = evaluate(yTest, mlp.predict(XTest, DECISION_THRESHOLD));
  console.log("\nFinal MLP (trained on full train set with tuned hyperparameters), test:", formatMetrics(mlpTest));

  // ---- Honest comparison and selection ----
  console.log("\n=== Comparison (held-out test set) ===");
  console.log("logreg:", formatMetrics(logregTest));
  console.log("mlp:   ", formatMetrics(mlpTest));

  const logregOk = logregTest.recall >= RECALL_FLOOR;
  const mlpOk = mlpTest.recall >= RECALL_FLOOR;
  let winner;
  if (mlpOk && (!logregOk || mlpTest.f1 > logregTest.f1)) {
    winner = "mlp";
  } else if (logregOk) {
    winner = "logreg";
  } else {
    // Neither cleared the floor — pick whichever has higher recall, since
    // that's the dimension that actually matters most here.
    winner = mlpTest.recall >= logregTest.recall ? "mlp" : "logreg";
  }
  console.log(
    `\nWinner: ${winner}${winner === "logreg" ? " — the simpler model matched or beat the tuned neural net on this feature set; see README for why that's a legitimate, reportable outcome, not a failure." : ""}`
  );

  const comparisonPath = path.join(__dirname, "model_comparison.json");
  fs.writeFileSync(
    comparisonPath,
    JSON.stringify(
      {
        trainedAt: new Date().toISOString(),
        logreg: { testMetrics: logregTest },
        mlp: { hyperparameters: bestHp, cvMetrics: search.best.cv, testMetrics: mlpTest, searchTrials: search.all.length },
        winner,
      },
      null,
      2
    )
  );
  console.log(`Saved full comparison to ${comparisonPath}`);

  const chosen = winner === "mlp" ? mlp : logreg;
  const chosenMetrics = winner === "mlp" ? mlpTest : logregTest;
  const outPath = path.join(__dirname, "model.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        modelType: winner,
        ...chosen.toJSON(),
        featureNames,
        decisionThreshold: DECISION_THRESHOLD,
        trainedAt: new Date().toISOString(),
        testMetrics: chosenMetrics,
      },
      null,
      2
    )
  );
  console.log(`Saved chosen model (${winner}) to ${outPath}`);

  if (chosenMetrics.recall < 0.85) {
    console.warn(
      "\nWARNING: recall on the held-out attack class is below 0.85 — for a security detector, missed attacks (false negatives) are the expensive failure mode."
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
