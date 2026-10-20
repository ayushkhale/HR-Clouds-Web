# AWS CloudWatch Monitoring for the HRMS Docker Deployment

## 1. Objective

Set up production-oriented monitoring for the HRMS application running in Docker on an AWS EC2 instance. The setup should provide visibility into host health, container/application logs, and operational failures, with alerts for important conditions.

This document defines the **requirements and proposed approach**. It is not an implementation record; the deployment details and existing configuration must be verified before making changes.

## 2. Scope

The initial scope includes:

- EC2 host monitoring: CPU, memory, disk usage, and instance status.
- Docker container logs for the HRMS Node.js backend and relevant supporting services.
- Application error visibility, including HTTP 5xx errors where the application emits structured logs or metrics.
- Basic availability checks for the backend.
- CloudWatch alarms and notification delivery.
- Security, retention, reliability, and cost considerations.

Likely supporting services include PostgreSQL and Redis if they run on the same EC2 host through Docker Compose. Confirm the actual service names and topology before implementation.

## 3. Requirements

### 3.1 Infrastructure monitoring

The solution must:

- Monitor EC2 CPU utilization and instance status.
- Collect host memory utilization and filesystem disk usage, which are not included in standard EC2 metrics by default.
- Associate metrics with the relevant EC2 instance.
- Use a reasonable collection interval, initially 60 seconds where appropriate.
- Alert on sustained resource pressure rather than transient spikes.

### 3.2 Container and application logs

The solution must:

- Send backend container stdout and stderr to CloudWatch Logs.
- Keep backend, PostgreSQL, and Redis logs in separate log groups where those services are in scope.
- Use predictable log group names and stream names.
- Configure log retention explicitly, initially 30 days unless business, security, or compliance requirements dictate otherwise.
- Ensure the Node.js application writes useful logs to stdout/stderr, or separately collect any file-based logs.
- Make logs searchable for troubleshooting errors and incidents.

### 3.3 Application health and errors

The solution should provide visibility into:

- Backend process/container restarts and unexpected exits.
- HTTP 5xx error counts or rates.
- API latency, if request-duration metrics are emitted.
- Database connection failures and connection-pool health.
- Backend availability through a monitored health endpoint.

Host-level monitoring alone is insufficient to confirm that the Node.js API is serving requests successfully.

### 3.4 Alerting

Configure CloudWatch alarms and a notification path, such as Amazon SNS with email subscriptions, for relevant conditions.

Initial thresholds to evaluate:

| Signal | Initial condition | Notes |
|---|---|---|
| EC2 CPU | Above 80% for 5 minutes | Tune to normal workload |
| Host memory | Above 85% for 5 minutes | Requires CloudWatch Agent metrics |
| Filesystem usage | Above 85% | Requires CloudWatch Agent metrics |
| EC2 status check | Failure in consecutive evaluation periods | Detects instance/system reachability problems |
| HTTP 5xx errors | Threshold based on observed traffic | Requires application logs or custom metrics |
| Health endpoint | Repeated failed checks | Use a scheduled or external availability check |

These are starting points, not universal production thresholds. Adjust them after establishing normal workload baselines. Avoid alerts that trigger repeatedly on harmless short-lived spikes.

### 3.5 Security and access control

The solution must:

- Use an IAM role attached to the EC2 instance instead of long-lived AWS access keys stored on the server.
- Grant only the permissions needed for CloudWatch Logs and CloudWatch Agent publishing.
- Restrict access to log groups and dashboards to authorized personnel.
- Never log passwords, access tokens, session cookies, or sensitive HR/payroll data.
- Use appropriate log retention and access policies for potentially sensitive HRMS data.

### 3.6 Reliability and cost

The solution should:

- Define what happens when CloudWatch endpoints are temporarily unavailable.
- Avoid unnecessary application blocking caused by synchronous log delivery.
- Consider Docker logging buffer limits and the possibility of dropped logs when using non-blocking logging.
- Set log retention explicitly and monitor ingestion volume.
- Start with essential metrics and logs, expanding only when useful.
- Validate the current AWS Region and estimated CloudWatch costs before rollout.

## 4. Proposed Approach

### Phase 1 — Discover and verify the current deployment

Before changing anything, inspect:

- EC2 operating system and architecture.
- AWS Region.
- Docker Engine and Docker Compose versions.
- Actual Compose service names for the backend, PostgreSQL, Redis, and any other services.
- Current Docker logging drivers and options.
- Whether Node.js/PM2 logs go to stdout/stderr or to files.
- Whether the EC2 instance already has an IAM role.
- Whether outbound access to required AWS endpoints is available.

**Do not overwrite the existing Compose file or replace service configuration blindly.** Preserve current images, environment variables, volumes, networks, health checks, ports, secrets, and restart policies.

### Phase 2 — Configure CloudWatch Logs for Docker

For services whose logs are written to stdout/stderr, configure Docker's `awslogs` logging driver in Docker Compose.

Example for a backend service (adapt the service name and retain all existing service settings):

```yaml
services:
  backend:
    # Keep the existing image, environment, ports, volumes,
    # networks, health checks, and other service settings.

    logging:
      driver: awslogs
      options:
        awslogs-region: ap-south-1
        awslogs-group: /hrclouds/production/backend
        awslogs-stream: backend
        awslogs-create-group: "true"
```

Replace `ap-south-1` with the actual AWS Region. Prefer explicitly creating log groups and setting retention through infrastructure configuration or the AWS Console, rather than relying only on automatic group creation.

Suggested separate log groups, if these services are in scope:

- `/hrclouds/production/backend`
- `/hrclouds/production/postgres`
- `/hrclouds/production/redis`

The exact names should follow the project's existing naming conventions.

#### Important logging considerations

- Docker's `awslogs` driver forwards container stdout and stderr. It does not automatically collect arbitrary application log files.
- If PM2 writes logs only to files, configure the application/PM2 to emit logs to stdout/stderr or use a separate log collection method.
- The Docker daemon's AWS identity/credentials and permissions must be verified for the logging driver. Do not assume that permissions available only inside the application container will be used by Docker.
- Consider Docker's non-blocking logging mode if application availability must be protected from logging backpressure. Set an appropriate buffer size and understand that buffered logs can be lost if the buffer fills.
- Confirm the logging driver works before applying it broadly to production services.

### Phase 3 — Configure EC2 host metrics

Install the Amazon CloudWatch Agent on the EC2 host.

Configure it to publish at least:

- Memory utilization.
- Filesystem used percentage for the relevant mounted filesystems.
- Instance dimensions so metrics can be associated with the correct EC2 instance.

Use a custom namespace such as `HRClouds/Production` if that fits the team's naming conventions. A 60-second collection interval is a reasonable starting point.

The agent should use the EC2 instance role. Apply the AWS-managed `CloudWatchAgentServerPolicy` as an initial standard option, then review whether a narrower custom policy is appropriate for the environment.

EC2 already publishes basic metrics such as CPU utilization, network activity, and status checks. The agent is needed for host memory and filesystem utilization.

### Phase 4 — Create dashboards and alarms

Create a CloudWatch dashboard showing:

- EC2 CPU utilization.
- Host memory utilization.
- Filesystem usage.
- EC2 status checks.
- Backend error metrics, once available.
- Health-check success/failure and latency metrics, once configured.

Create alarms for sustained CPU/memory pressure, low disk capacity, EC2 status-check failures, backend error spikes, and repeated health-check failures. Route important notifications through Amazon SNS or the team's existing incident-notification system.

An EC2 status check does not confirm that the Node.js API is healthy. Add an application-level health check separately.

### Phase 5 — Improve application observability

Standardize Node.js logs as structured JSON where practical. Useful fields include:

- `timestamp`
- `level`
- `message`
- `requestId`
- `method`
- `route` (avoid sensitive or high-cardinality values)
- `statusCode`
- `durationMs`
- `errorCode` or a sanitized error classification

Do not include authorization headers, tokens, passwords, full sensitive request bodies, or confidential employee/payroll information.

Add application instrumentation for:

- HTTP request count and latency.
- HTTP 5xx error count/rate.
- Node.js process memory, including heap usage.
- Database connection failures and connection-pool utilization.
- Graceful shutdown and unhandled failure visibility.

Choose either structured-log metric filters or explicit custom metrics based on the expected volume, latency needs, and cost. Avoid high-cardinality dimensions such as raw URLs, user IDs, or request IDs in custom metrics.

### Phase 6 — Validate and roll out safely

Before applying changes:

1. Back up the current Docker Compose and relevant agent configuration.
2. Review the proposed diff.
3. Validate Compose syntax using `docker compose config`.
4. Confirm IAM permissions, AWS Region, log group names, and retention.
5. Apply changes during an appropriate deployment window.
6. Verify container health and application availability.
7. Confirm new log streams and log events appear in CloudWatch.
8. Confirm host metrics are publishing.
9. Trigger a safe test event to validate alarms and notifications.
10. Document rollback steps.

Do not intentionally cause a production outage or exhaust disk/memory to test alarms. Use a controlled test metric or other safe test mechanism where possible.

## 5. IAM and permissions

Use an IAM role attached to EC2; do not store long-lived AWS access keys in the application container or repository.

The permissions differ by component:

- **CloudWatch Agent:** permissions to publish metrics and, if it collects logs, to create/write the necessary log streams.
- **Docker `awslogs` driver:** permissions to create log streams and publish log events; it also needs log-group creation permission if automatic creation is enabled.
- **Administration/deployment identity:** permissions to create or configure log groups, retention, alarms, dashboards, and SNS topics.

Use least privilege and test permissions in the target account. Confirm which identity Docker uses for the `awslogs` driver in the actual host configuration.

## 6. Acceptance criteria

The initial implementation is complete when:

- [ ] EC2 CPU and status-check metrics are visible in CloudWatch.
- [ ] Host memory and filesystem metrics are visible.
- [ ] Backend container logs arrive in the intended CloudWatch log group.
- [ ] Relevant PostgreSQL/Redis logs arrive in separate groups if included in scope.
- [ ] Log retention is configured.
- [ ] IAM access follows least-privilege principles and uses roles rather than embedded long-lived keys.
- [ ] Dashboard panels show the selected operational signals.
- [ ] Alarm notifications reach the intended recipients.
- [ ] Application-level health monitoring is verified independently of EC2 status checks.
- [ ] Logs do not expose credentials or sensitive HR/payroll data.
- [ ] A rollback procedure is documented and the application remains healthy after rollout.

## 7. Decisions to confirm before implementation

The following details must be confirmed from the actual deployment rather than assumed:

1. EC2 operating system and CPU architecture.
2. AWS Region.
3. Docker Compose service names and whether PostgreSQL/Redis are on the same host.
4. Whether PM2 writes to stdout/stderr or files.
5. Existing Docker logging configuration.
6. Existing IAM instance role and permission boundaries.
7. Required log retention and who should receive alerts.
8. Expected request volume and any compliance requirements for HR/payroll logs.

## 8. Official AWS references

- [CloudWatch Agent installation and configuration](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html)
- [CloudWatch Agent configuration file](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html)
- [Docker `awslogs` logging driver](https://docs.docker.com/engine/logging/drivers/awslogs/)
- [CloudWatch alarms and email notifications](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

---

**Implementation principle:** Start with reliable host metrics and container logs, validate delivery and permissions, then add application-level metrics and alerts. Keep the setup incremental, least-privileged, cost-aware, and reversible.
