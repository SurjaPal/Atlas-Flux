// layer0/costSensitiveClassifier.js
//
// "Cost-sensitive classification: because real attacks (like real hardware
// Trojans) are rare, high-stakes, needle-in-haystack events, detection
// uses a cost-sensitive classifier tuned for severe class imbalance rather
// than standard accuracy-optimized models." — Final Architecture, Layer 0.
//
// This is a from-scratch logistic regression trained by batch gradient
// descent with a per-class weight on the loss (the attack/positive class
// is weighted far higher than the normal/negative class), so the model is
// penalized much more for missing an attack than for a false alarm — the
// same asymmetry a real fraud/Trojan detector has to be tuned for, and
// the reason plain accuracy is the wrong metric here (a classifier that
// always predicts "normal" would have >95% accuracy on this data and be
// useless). Evaluation below reports precision/recall/F1 instead.

function standardize(X, mean, std) {
  return X.map((row) => row.map((v, j) => (v - mean[j]) / (std[j] || 1)));
}

function computeMeanStd(X) {
  const n = X.length;
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n;
  const std = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2 / n;
  return { mean, std: std.map(Math.sqrt) };
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

class CostSensitiveLogisticClassifier {
  constructor({ l2 = 0.001 } = {}) {
    this.l2 = l2;
    this.weights = null;
    this.bias = 0;
    this.mean = null;
    this.std = null;
  }

  /**
   * @param {number[][]} XRaw - feature matrix
   * @param {number[]} y - labels, 0 or 1
   * @param {Object} opts
   * @param {number} opts.positiveWeight - loss multiplier for y=1 examples (>1 favors recall on the rare class)
   * @param {number} opts.epochs
   * @param {number} opts.lr
   */
  train(XRaw, y, { positiveWeight = 8, epochs = 400, lr = 0.5 } = {}) {
    const { mean, std } = computeMeanStd(XRaw);
    this.mean = mean;
    this.std = std;
    const X = standardize(XRaw, mean, std);

    const n = X.length;
    const d = X[0].length;
    this.weights = new Array(d).fill(0);
    this.bias = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradW = new Array(d).fill(0);
      let gradB = 0;

      for (let i = 0; i < n; i++) {
        const z = this.weights.reduce((s, w, j) => s + w * X[i][j], this.bias);
        const p = sigmoid(z);
        const sampleWeight = y[i] === 1 ? positiveWeight : 1;
        const error = (p - y[i]) * sampleWeight;

        for (let j = 0; j < d; j++) gradW[j] += (error * X[i][j]) / n;
        gradB += error / n;
      }

      for (let j = 0; j < d; j++) {
        this.weights[j] -= lr * (gradW[j] + this.l2 * this.weights[j]);
      }
      this.bias -= lr * gradB;
    }

    return this;
  }

  predictProba(XRaw) {
    const X = standardize(XRaw, this.mean, this.std);
    return X.map((row) => sigmoid(this.weights.reduce((s, w, j) => s + w * row[j], this.bias)));
  }

  predict(XRaw, threshold = 0.5) {
    return this.predictProba(XRaw).map((p) => (p >= threshold ? 1 : 0));
  }

  toJSON() {
    return { weights: this.weights, bias: this.bias, mean: this.mean, std: this.std, l2: this.l2 };
  }

  static fromJSON(obj) {
    const c = new CostSensitiveLogisticClassifier({ l2: obj.l2 });
    c.weights = obj.weights;
    c.bias = obj.bias;
    c.mean = obj.mean;
    c.std = obj.std;
    return c;
  }
}

/** Precision/recall/F1 — the metrics that actually matter under class imbalance, unlike accuracy. */
function evaluate(yTrue, yPred) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, tn, precision, recall, f1 };
}

module.exports = { CostSensitiveLogisticClassifier, evaluate };
