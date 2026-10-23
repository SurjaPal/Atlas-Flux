// layer0/neuralNet.js
//
// A genuine (if small) feedforward neural network — forward pass, backprop,
// mini-batch gradient descent, all hand-rolled, no ML framework dependency
// (consistent with the rest of layer0/, and avoids pulling in a multi-
// hundred-MB framework for a 9-input-feature problem). This exists
// specifically to give the project a real deep-learning data point to
// compare against the logistic-regression baseline in
// costSensitiveClassifier.js — see hyperparamSearch.js and train.js for
// the honest comparison.
//
// Architecture: configurable hidden layers, ReLU activations, sigmoid
// output, cost-sensitive weighted binary cross-entropy loss (same
// rare-class weighting rationale as the logistic baseline), L2
// regularization, mini-batch SGD with momentum.

function randInit(fanIn, fanOut) {
  // He initialization — standard for ReLU networks, not arbitrary.
  const scale = Math.sqrt(2 / fanIn);
  const W = [];
  for (let i = 0; i < fanOut; i++) {
    const row = [];
    for (let j = 0; j < fanIn; j++) row.push((Math.random() * 2 - 1) * scale);
    W.push(row);
  }
  return W;
}

function zeros(n) {
  return new Array(n).fill(0);
}

function relu(x) {
  return x > 0 ? x : 0;
}
function reluGrad(x) {
  return x > 0 ? 1 : 0;
}
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

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

class MLPClassifier {
  /**
   * @param {Object} opts
   * @param {number} opts.inputSize
   * @param {number[]} opts.hiddenSizes - e.g. [16, 8] for two hidden layers
   * @param {number} opts.l2
   */
  constructor({ inputSize, hiddenSizes = [16], l2 = 0.001 } = {}) {
    this.inputSize = inputSize;
    this.hiddenSizes = hiddenSizes;
    this.l2 = l2;
    this.mean = null;
    this.std = null;

    const sizes = [inputSize, ...hiddenSizes, 1];
    this.weights = [];
    this.biases = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      this.weights.push(randInit(sizes[l], sizes[l + 1]));
      this.biases.push(zeros(sizes[l + 1]));
    }
  }

  _forward(x) {
    // Returns { activations, preActivations } for every layer, needed by backprop.
    const activations = [x];
    const preActivations = [];
    let a = x;
    for (let l = 0; l < this.weights.length; l++) {
      const W = this.weights[l];
      const b = this.biases[l];
      const isOutput = l === this.weights.length - 1;
      const z = W.map((row, i) => row.reduce((s, w, j) => s + w * a[j], b[i]));
      preActivations.push(z);
      a = isOutput ? z.map(sigmoid) : z.map(relu);
      activations.push(a);
    }
    return { activations, preActivations };
  }

  predictProba(XRaw) {
    const X = standardize(XRaw, this.mean, this.std);
    return X.map((x) => {
      const { activations } = this._forward(x);
      return activations[activations.length - 1][0];
    });
  }

  predict(XRaw, threshold = 0.5) {
    return this.predictProba(XRaw).map((p) => (p >= threshold ? 1 : 0));
  }

  /**
   * @param {Object} opts
   * @param {number} opts.positiveWeight - loss multiplier for y=1 examples
   * @param {number} opts.epochs
   * @param {number} opts.lr
   * @param {number} opts.batchSize
   * @param {number} opts.momentum
   */
  train(XRaw, y, { positiveWeight = 4, epochs = 150, lr = 0.05, batchSize = 32, momentum = 0.9 } = {}) {
    const { mean, std } = computeMeanStd(XRaw);
    this.mean = mean;
    this.std = std;
    const X = standardize(XRaw, mean, std);
    const n = X.length;

    // Momentum buffers, same shape as weights/biases.
    const vW = this.weights.map((layer) => layer.map((row) => row.map(() => 0)));
    const vB = this.biases.map((layer) => layer.map(() => 0));

    for (let epoch = 0; epoch < epochs; epoch++) {
      const order = [...Array(n).keys()].sort(() => Math.random() - 0.5);

      for (let batchStart = 0; batchStart < n; batchStart += batchSize) {
        const batchIdx = order.slice(batchStart, batchStart + batchSize);
        const gradW = this.weights.map((layer) => layer.map((row) => row.map(() => 0)));
        const gradB = this.biases.map((layer) => layer.map(() => 0));

        for (const i of batchIdx) {
          const { activations, preActivations } = this._forward(X[i]);
          const L = this.weights.length;
          const sampleWeight = y[i] === 1 ? positiveWeight : 1;

          // Output layer error (binary cross-entropy + sigmoid combine to this simple form).
          const yhat = activations[L][0];
          let delta = [(yhat - y[i]) * sampleWeight];

          for (let l = L - 1; l >= 0; l--) {
            const aPrev = activations[l];
            for (let i2 = 0; i2 < this.weights[l].length; i2++) {
              for (let j = 0; j < this.weights[l][i2].length; j++) {
                gradW[l][i2][j] += (delta[i2] * aPrev[j]) / batchIdx.length;
              }
              gradB[l][i2] += delta[i2] / batchIdx.length;
            }
            if (l > 0) {
              const prevSize = this.weights[l - 1].length;
              const newDelta = new Array(prevSize).fill(0);
              for (let k = 0; k < prevSize; k++) {
                let s = 0;
                for (let i2 = 0; i2 < this.weights[l].length; i2++) s += this.weights[l][i2][k] * delta[i2];
                newDelta[k] = s * reluGrad(preActivations[l - 1][k]);
              }
              delta = newDelta;
            }
          }
        }

        // Momentum update + L2.
        for (let l = 0; l < this.weights.length; l++) {
          for (let i2 = 0; i2 < this.weights[l].length; i2++) {
            for (let j = 0; j < this.weights[l][i2].length; j++) {
              const g = gradW[l][i2][j] + this.l2 * this.weights[l][i2][j];
              vW[l][i2][j] = momentum * vW[l][i2][j] - lr * g;
              this.weights[l][i2][j] += vW[l][i2][j];
            }
            vB[l][i2] = momentum * vB[l][i2] - lr * gradB[l][i2];
            this.biases[l][i2] += vB[l][i2];
          }
        }
      }
    }
    return this;
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSizes: this.hiddenSizes,
      l2: this.l2,
      weights: this.weights,
      biases: this.biases,
      mean: this.mean,
      std: this.std,
    };
  }

  static fromJSON(obj) {
    const net = new MLPClassifier({ inputSize: obj.inputSize, hiddenSizes: obj.hiddenSizes, l2: obj.l2 });
    net.weights = obj.weights;
    net.biases = obj.biases;
    net.mean = obj.mean;
    net.std = obj.std;
    return net;
  }
}

module.exports = { MLPClassifier };
