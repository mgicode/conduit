import _ from 'lodash';
import { ApiHelpers } from './util/ApiHelpers.js';
import CallToAction from './CallToAction.jsx';
import ConduitSpinner from "./ConduitSpinner.jsx";
import DeploymentSummary from './DeploymentSummary.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import React from 'react';
import { rowGutter } from './util/Utils.js';
import TabbedMetricsTable from './TabbedMetricsTable.jsx';
import { Col, Row } from 'antd';
import { emptyMetric, processRollupMetrics, processTimeseriesMetrics } from './util/MetricUtils.js';
import './../../css/deployments.css';
import 'whatwg-fetch';

const maxTsToFetch = 15; // Beyond this, stop showing sparklines in table
export default class Deployments extends React.Component {
  constructor(props) {
    super(props);
    this.api = ApiHelpers(this.props.pathPrefix);
    this.loadFromServer = this.loadFromServer.bind(this);
    this.loadTimeseriesFromServer = this.loadTimeseriesFromServer.bind(this);
    this.handleApiError = this.handleApiError.bind(this);

    this.state = {
      metricsWindow: "10m",
      pollingInterval: 10000, // TODO: poll based on metricsWindow size
      metrics: [],
      timeseriesByDeploy: {},
      lastUpdated: 0,
      limitSparklineData: false,
      pendingRequests: false,
      loaded: false,
      error: ''
    };
  }

  componentDidMount() {
    this.loadFromServer();
    this.timerId = window.setInterval(this.loadFromServer, this.state.pollingInterval);
  }

  componentWillUnmount() {
    window.clearInterval(this.timerId);
  }

  getDeploymentList(pods) {
    return _(pods)
      .reject(p => _.isEmpty(p.deployment) || p.controlPlane)
      .groupBy('deployment')
      .map((componentPods, name) => {
        return { name: name, added: _.every(componentPods, 'added') };
      })
      .sortBy('name')
      .value();
  }

  addDeploysWithNoMetrics(deploys, metrics) {
    // also display deployments which have not been added to the service mesh
    // (and therefore have no associated metrics)
    let newMetrics = [];
    let metricsByName = _.groupBy(metrics, 'name');
    _.each(deploys, data => {
      newMetrics.push(_.get(metricsByName, [data.name, 0], emptyMetric(data.name, data.added)));
    });
    return newMetrics;
  }

  loadFromServer() {
    if (this.state.pendingRequests) {
      return; // don't make more requests if the ones we sent haven't completed
    }
    this.setState({ pendingRequests: true });

    let rollupRequest = this.api.fetchRollup(this.state.metricsWindow);
    let podsRequest = this.api.fetchPods(this.props.pathPrefix);

    // expose serverPromise for testing
    this.serverPromise = Promise.all([rollupRequest, podsRequest])
      .then(([rollup, p]) => {
        let poByDeploy = this.getDeploymentList(p.pods);
        let meshDeploys = processRollupMetrics(rollup.metrics, "targetDeploy");
        let combinedMetrics = this.addDeploysWithNoMetrics(poByDeploy, meshDeploys);

        this.loadTimeseriesFromServer(meshDeploys, combinedMetrics);
      })
      .catch(this.handleApiError);
  }

  loadTimeseriesFromServer(meshDeployMetrics, combinedMetrics) {
    let limitSparklineData = _.size(meshDeployMetrics) > maxTsToFetch;
    let timeseriesPath = this.api.timeseriesPath(this.state.metricsWindow);

    let updatedState = {
      metrics: combinedMetrics,
      limitSparklineData: limitSparklineData,
      loaded: true,
      pendingRequests: false,
      error: ''
    };

    if (limitSparklineData) {
      // don't fetch timeseries for every deploy
      let leastHealthyDeployments = this.getLeastHealthyDeployments(meshDeployMetrics);

      let tsPromises = _.map(leastHealthyDeployments, dep => {
        let tsPathForDeploy = `${timeseriesPath}&target_deploy=${dep.name}`;
        return this.api.fetch(tsPathForDeploy);
      });
      Promise.all(tsPromises)
        .then(tsMetrics => {
          let leastHealthyTs = _.reduce(tsMetrics, (mem, ea) => {
            mem = mem.concat(ea.metrics);
            return mem;
          }, []);
          let tsByDeploy = processTimeseriesMetrics(leastHealthyTs, "targetDeploy");
          this.setState(_.merge({}, updatedState, {
            timeseriesByDeploy: tsByDeploy,
            lastUpdated: Date.now(),
          }));
        }).catch(this.handleApiError);
    } else {
      // fetch timeseries for all deploys
      this.api.fetch(timeseriesPath)
        .then(ts => {
          let tsByDeploy = processTimeseriesMetrics(ts.metrics, "targetDeploy");
          this.setState(_.merge({}, updatedState, {
            timeseriesByDeploy: tsByDeploy,
            lastUpdated: Date.now()
          }));
        }).catch(this.handleApiError);
    }
  }

  handleApiError(e) {
    this.setState({
      pendingRequests: false,
      error: `Error getting data from server: ${e.message}`
    });
  }

  getLeastHealthyDeployments(deployMetrics, limit = 3) {
    return _(deployMetrics)
      .filter('added')
      .sortBy('successRate')
      .take(limit)
      .value();
  }

  renderPageContents() {
    let leastHealthyDeployments = this.getLeastHealthyDeployments(this.state.metrics);

    return (
      <div className="clearfix">
        <div className="subsection-header">Least-healthy deployments</div>
        {_.isEmpty(this.state.metrics) ? <div className="no-data-msg">No data</div> : null}
        <Row gutter={rowGutter}>
          {
            _.map(leastHealthyDeployments, deployment => {
              return (<Col span={8} key={`col-${deployment.name}`}>
                <DeploymentSummary
                  key={deployment.name}
                  lastUpdated={this.state.lastUpdated}
                  data={deployment}
                  requestTs={_.get(this.state.timeseriesByDeploy, [deployment.name, "REQUEST_RATE"], [])}
                  pathPrefix={this.props.pathPrefix} />
              </Col>);
            })
          }
        </Row>
        <div className="deployments-list">
          <TabbedMetricsTable
            resource="deployment"
            lastUpdated={this.state.lastUpdated}
            metrics={this.state.metrics}
            timeseries={this.state.timeseriesByDeploy}
            hideSparklines={this.state.limitSparklineData}
            pathPrefix={this.props.pathPrefix} />
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.loaded) {
      return (<div>
        { !this.state.error ? null : <ErrorBanner message={this.state.error} /> }
        <ConduitSpinner />
      </div>);
    } else return (
      <div className="page-content">
        { !this.state.error ? null : <ErrorBanner message={this.state.error} /> }
        <div className="page-header">
          <h1>All deployments</h1>
        </div>
        {
          _.isEmpty(this.state.metrics) ?
            <CallToAction numDeployments={_.size(this.state.metrics)} /> :
            this.renderPageContents()
        }
      </div>
    );
  }
}
