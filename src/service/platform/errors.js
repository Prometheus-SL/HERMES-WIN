function createFeatureUnavailableError(feature, message) {
  const error = new Error(
    message || `${feature} is not available on ${process.platform}.`
  );
  error.code = 'feature_unavailable';
  error.feature = feature;
  return error;
}

module.exports = {
  createFeatureUnavailableError,
};
