# S3 Tables Data Modeling Feature

## Overview

The S3 Tables Data Modeling feature enables automatic aggregation and analysis of clickstream event data using Amazon S3 Tables (Iceberg format) and EMR Serverless. This feature creates pre-aggregated tables for common analytics queries, improving query performance and reducing costs.

## Prerequisites

### 1. Create S3 Table Bucket

Before deploying the S3 Tables Data Modeling stack, you must create an S3 Table Bucket in your AWS account.

```bash
# Using AWS CLI
aws s3tables create-table-bucket \
  --name your-table-bucket-name \
  --region your-region
```

**Note**: S3 Tables is currently available in the following regions:
- US East (N. Virginia) - us-east-1
- US East (Ohio) - us-east-2
- US West (Oregon) - us-west-2
- Europe (Ireland) - eu-west-1
- Asia Pacific (Tokyo) - ap-northeast-1

### 2. Verify S3 Tables Service Availability

Ensure S3 Tables service is available in your target region before deployment.

## Deployment

### CloudFormation Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| VpcId | VPC ID for EMR Serverless | Required |
| PrivateSubnetIds | Comma-separated private subnet IDs | Required |
| ProjectId | Clickstream project ID | Required |
| AppIds | Comma-separated app IDs | Required |
| S3TableBucketArn | ARN of the S3 Table Bucket | Required |
| S3TableNamespace | Namespace for tables (default: clickstream_{projectId}) | Optional |
| ScheduleExpression | Job schedule (cron or rate) | cron(0 2 * * ? *) |
| DataRetentionDays | Data retention period (1-3650) | 365 |
| OdsS3Bucket | ODS data S3 bucket | Required |
| OdsS3Prefix | ODS data S3 prefix | clickstream/ |
| PipelineS3Bucket | Pipeline S3 bucket for temp files | Required |
| PipelineS3Prefix | Pipeline S3 prefix | pipeline-temp/ |
| EmrReleaseLabel | EMR Serverless release version | emr-7.5.0 |
| EmrApplicationIdleTimeoutMinutes | EMR app idle timeout | 15 |

### Deploy via Console

1. Navigate to CloudFormation in AWS Console
2. Create new stack with the S3 Tables Modeling template
3. Fill in required parameters
4. Review and create stack

### Deploy via CLI

```bash
aws cloudformation create-stack \
  --stack-name clickstream-s3tables-modeling \
  --template-body file://s3-tables-modeling-stack.template.json \
  --parameters \
    ParameterKey=VpcId,ParameterValue=vpc-xxx \
    ParameterKey=PrivateSubnetIds,ParameterValue="subnet-xxx,subnet-yyy" \
    ParameterKey=ProjectId,ParameterValue=my-project \
    ParameterKey=AppIds,ParameterValue="app1,app2" \
    ParameterKey=S3TableBucketArn,ParameterValue=arn:aws:s3tables:us-east-1:123456789012:bucket/my-table-bucket \
    ParameterKey=OdsS3Bucket,ParameterValue=my-ods-bucket \
    ParameterKey=PipelineS3Bucket,ParameterValue=my-pipeline-bucket \
  --capabilities CAPABILITY_IAM
```

## Created Tables

The feature creates the following Iceberg tables in S3 Tables:

### 1. event_daily_summary
Daily aggregated event metrics.

| Column | Type | Description |
|--------|------|-------------|
| app_id | STRING | Application ID |
| event_date | DATE | Event date |
| event_name | STRING | Event name |
| platform | STRING | Platform (Web/iOS/Android) |
| geo_country | STRING | Country code |
| event_count | BIGINT | Total event count |
| user_count | BIGINT | Unique user count |
| session_count | BIGINT | Unique session count |
| updated_at | TIMESTAMP | Last update time |

### 2. event_hourly_summary
Hourly aggregated event metrics (same schema as daily with event_hour instead of event_date).

### 3. user_behavior
User behavior analysis table.

### 4. session_analysis
Session-level analysis table.

### 5. retention_daily / retention_weekly
User retention analysis tables.

## API Endpoints

### Trigger Job Manually

```
POST /api/pipeline/{pipelineId}/s3tables-modeling/trigger?pid={projectId}
```

Request body (optional):
```json
{
  "startTimestamp": "2024-01-01T00:00:00Z",
  "endTimestamp": "2024-01-02T00:00:00Z",
  "jobName": "manual-job-001",
  "reRunJob": false
}
```

### Get Modeling Status

```
GET /api/pipeline/{pipelineId}/s3tables-modeling/status?pid={projectId}
```

### Get Job History

```
GET /api/pipeline/{pipelineId}/s3tables-modeling/jobs?pid={projectId}&limit=10
```

## Monitoring

### CloudWatch Logs

EMR Serverless job logs are stored in:
```
s3://{pipelineS3Bucket}/{pipelineS3Prefix}pipeline-logs/{projectId}/s3tables/
```

### Job Status

Job status is tracked via EventBridge rules and stored in:
```
s3://{pipelineS3Bucket}/{pipelineS3Prefix}s3tables-job-info/{projectId}/
```

## Troubleshooting

### Common Issues

1. **Job fails with "Path does not exist"**
   - Verify ODS data exists in the specified S3 path
   - Check the time range includes data

2. **Namespace creation fails**
   - Ensure the namespace follows S3 Tables naming rules (lowercase, starts with letter)
   - Verify IAM permissions for s3tables:CreateNamespace

3. **EMR Application fails to start**
   - Check VPC has proper NAT gateway for internet access
   - Verify security group allows outbound traffic

4. **Permission denied errors**
   - Review IAM role permissions for EMR execution role
   - Ensure S3 Table Bucket policy allows access

## Best Practices

1. **Schedule Jobs During Off-Peak Hours**
   - Default schedule runs at 2 AM UTC
   - Adjust based on your data ingestion patterns

2. **Monitor Data Retention**
   - Set appropriate retention days based on compliance requirements
   - Iceberg tables support time travel for historical queries

3. **Optimize EMR Configuration**
   - Adjust idle timeout based on job frequency
   - Consider EMR release version compatibility with your Spark code
