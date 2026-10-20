function calculateMetrics(tp, fp, fn, tn) {
  const counts = [tp, fp, fn, tn];
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new RangeError("Counts must be non-negative safe integers");
  const [positivePredictions, actualPositives, actualNegatives, correctPredictions, total] = [tp + fp, tp + fn, tn + fp, tp + tn, tp + fp + fn + tn];
  if (![positivePredictions, actualPositives, actualNegatives, correctPredictions, total].every(Number.isSafeInteger)) throw new RangeError("Count totals exceed the safe integer range");
  const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
  const precision = ratio(tp, positivePredictions);
  const recall = ratio(tp, actualPositives);
  return {
    accuracy: ratio(correctPredictions, total), precision, recall,
    specificity: ratio(tn, actualNegatives),
    f1: precision == null || recall == null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall)
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = calculateMetrics;
