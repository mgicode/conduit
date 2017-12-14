import { Alert } from 'antd';
import React from 'react';

const defaultErrorMsg = "An error has occurred";

export default class ErrorMessage extends React.Component {
  render() {
    let alertSeverity = this.props.severity || "warning";

    return (
      <div className="error-message-container">
        <Alert
          message={this.props.message || defaultErrorMsg}
          type={alertSeverity} />
      </div>
    );
  }
}
