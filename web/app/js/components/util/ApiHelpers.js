import 'whatwg-fetch';

let defaultMetricsWindow = '10m';

export const ApiHelpers = pathPrefix => {
  const rollupPath = (metricsWindow, aggregation = '') => {
    return `${pathPrefix}/api/metrics?window=${metricsWindow}&aggregation=${aggregation}`;
  };
  const timeseriesPath = (metricsWindow, aggregation = '') => {
    return `${rollupPath(metricsWindow, aggregation)}&timeseries=true`;
  };
  const podsPath = `${pathPrefix}/api/pods`;

  const apiFetch = path => {
    return fetch(path).then(handleFetchErr).then(r => r.json());
  };

  const fetchRollup = (window = defaultMetricsWindow, aggregation = '') => {
    return apiFetch(rollupPath(window, aggregation));
  };

  const fetchTimeseries = (window = defaultMetricsWindow, aggregation = '') => {
    return apiFetch(timeseriesPath(window, aggregation));
  };

  const fetchPods = () => {
    return apiFetch(podsPath);
  };

  const handleFetchErr = resp => {
    if (!resp.ok) {
      throw Error(resp.statusText);
    }
    return resp;
  };

  return {
    fetch: apiFetch,
    fetchRollup,
    fetchTimeseries,
    fetchPods,
    timeseriesPath
  };
};
