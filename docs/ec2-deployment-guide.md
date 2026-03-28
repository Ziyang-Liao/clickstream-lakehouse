# Clickstream Analytics on AWS - EC2 部署完整指南

本指南适用于在 Amazon Linux 2023 (x86_64) EC2 实例上从源码部署 Clickstream Analytics。

## 前置条件

- EC2 实例：Amazon Linux 2023, x86_64 架构，建议 t3.xlarge 或更高配置
- IAM 角色或 AWS 凭证：需要 AdministratorAccess 权限
- 磁盘空间：至少 50GB
- 内存：至少 8GB

## 第一步：安装依赖

```bash
# 更新系统
sudo dnf update -y

# 安装 Git
sudo dnf install -y git

# 安装 Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# 安装 pnpm
sudo npm install -g pnpm@9.15.3

# 安装 Docker
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# 安装 AWS CDK
sudo npm install -g aws-cdk
```

## 第二步：配置 AWS 凭证

```bash
# 配置 AWS CLI（如果使用 IAM 用户）
aws configure
# 输入 Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# 验证配置
aws sts get-caller-identity
```

## 第三步：克隆代码并安装依赖

```bash
cd /home/ec2-user
git clone https://github.com/aws-solutions/clickstream-analytics-on-aws.git clickstream-analytics
cd clickstream-analytics

# 安装项目依赖
pnpm install && pnpm projen && pnpm nx build @aws/clickstream-base-lib
```

## 第四步：修复 TypeScript 类型错误

前端代码中有多处 `header={t('...')}` 需要修复类型问题：

```bash
cd /home/ec2-user/clickstream-analytics

# 修复所有 header={t('...')} 类型错误
sed -i "s/header={t('fieldFilter:bulkImportTitle')}/header={t('fieldFilter:bulkImportTitle') ?? ''}/g" frontend/src/components/field-filter/FieldListEditor.tsx

sed -i "s/header={t('project:delete.title')}/header={t('project:delete.title') ?? ''}/g" frontend/src/pages/projects/comps/ProjectsHeader.tsx

sed -i "s/header={t('fieldFilter:unsavedChanges')}/header={t('fieldFilter:unsavedChanges') ?? ''}/g" frontend/src/pages/pipelines/detail/comps/FieldFilter.tsx

sed -i "s/header={t('fieldFilter:deleteRule')}/header={t('fieldFilter:deleteRule') ?? ''}/g" frontend/src/pages/pipelines/detail/comps/FieldFilter.tsx

sed -i "s/header={t('pipeline:upgrade.title')}/header={t('pipeline:upgrade.title') ?? ''}/g" frontend/src/pages/pipelines/comps/BasicInfo.tsx

sed -i "s/header={t('pipeline:create.securityWarning')}/header={t('pipeline:create.securityWarning') ?? ''}/g" frontend/src/pages/pipelines/create/steps/ConfigIngestion.tsx

sed -i "s/header={t('pipeline:create.nextSteps')}/header={t('pipeline:create.nextSteps') ?? ''}/g" frontend/src/pages/pipelines/create/steps/ConfigIngestion.tsx

sed -i "s/header={t('pipeline:create.quickSightNotSub')}/header={t('pipeline:create.quickSightNotSub') ?? ''}/g" frontend/src/pages/pipelines/create/steps/Reporting.tsx

sed -i "s/header={t('pipeline:create.quickSightNotEnterprise')}/header={t('pipeline:create.quickSightNotEnterprise') ?? ''}/g" frontend/src/pages/pipelines/create/steps/Reporting.tsx

sed -i "s/header={t('pipeline:create.reportNotSupported')}/header={t('pipeline:create.reportNotSupported') ?? ''}/g" frontend/src/pages/pipelines/create/steps/Reporting.tsx

sed -i "s/header={t('user:labels.deleteTitle')}/header={t('user:labels.deleteTitle') ?? ''}/g" frontend/src/pages/user/UserTableHeader.tsx

sed -i "s/header={t('user:labels.createTitle')}/header={t('user:labels.createTitle') ?? ''}/g" frontend/src/pages/user/CreateUser.tsx

sed -i "s/header={t('user:labels.userSetting')}/header={t('user:labels.userSetting') ?? ''}/g" frontend/src/pages/user/SettingUser.tsx

sed -i "s/header={t('header.accessDeniedTitle')}/header={t('header.accessDeniedTitle') ?? ''}/g" frontend/src/pages/error-page/AccessDenied.tsx

sed -i "s/header={t('header.reSignIn')}/header={t('header.reSignIn') ?? ''}/g" frontend/src/pages/error-page/ReSignIn.tsx

sed -i "s/header={t('fieldFilter:unsavedChanges')}/header={t('fieldFilter:unsavedChanges') ?? ''}/g" frontend/src/pages/application/detail/comp/AppFieldFilter.tsx

sed -i "s/header={t('fieldFilter:deleteRule')}/header={t('fieldFilter:deleteRule') ?? ''}/g" frontend/src/pages/application/detail/comp/AppFieldFilter.tsx

sed -i "s/header={t('analytics:dashboard.createTitle')}/header={t('analytics:dashboard.createTitle') ?? ''}/g" frontend/src/pages/analytics/dashboard/create/CreateDashboard.tsx

sed -i "s/header={t('analytics:noDataAvailableTitle')}/header={t('analytics:noDataAvailableTitle') ?? ''}/g" frontend/src/pages/analytics/AnalyticsHome.tsx

sed -i "s/header={t('common:button.deleteDashboard')}/header={t('common:button.deleteDashboard') ?? ''}/g" frontend/src/pages/analytics/comps/DashboardHeader.tsx

sed -i "s/header={t('analytics:header.saveToDashboardModalTitle')}/header={t('analytics:header.saveToDashboardModalTitle') ?? ''}/g" frontend/src/pages/analytics/comps/SelectDashboardModal.tsx

sed -i "s/header={t('analytics:metadata.userAttribute.split.title')}/header={t('analytics:metadata.userAttribute.split.title') ?? ''}/g" frontend/src/pages/analytics/metadata/user-attributes/MetadataUserAttributeSplitPanel.tsx

sed -i "s/header={t('analytics:metadata.eventParameter.split.title')}/header={t('analytics:metadata.eventParameter.split.title') ?? ''}/g" frontend/src/pages/analytics/metadata/event-parameters/MetadataParameterSplitPanel.tsx

sed -i "s/header={t('analytics:metadata.event.split.title')}/header={t('analytics:metadata.event.split.title') ?? ''}/g" frontend/src/pages/analytics/metadata/events/MetadataEventSplitPanel.tsx
```

## 第五步：修复 Docker 构建问题

在执行部署脚本前，先修复已知的 Docker 构建问题：

```bash
cd /home/ec2-user/clickstream-analytics/deployment

# 修复 docker push --platform 不支持的问题
sed -i 's/docker push \${newImage} --platform \${exebuildPlatform}/docker push \${newImage}/g' post-build-1/index.js
```

## 第六步：执行部署脚本（构建阶段）

```bash
cd /home/ec2-user/clickstream-analytics/deployment

# 使用 sudo 并传递 AWS 凭证环境变量
sudo AWS_SHARED_CREDENTIALS_FILE=/home/ec2-user/.aws/credentials \
     AWS_CONFIG_FILE=/home/ec2-user/.aws/config \
     sh solution-deploy.sh \
     --region us-east-1 \
     --profile default \
     --email <your-email@example.com>
```

**注意**：将 `<your-email@example.com>` 替换为你的实际邮箱地址。

## 第七步：修复 Docker 镜像架构问题（如果遇到）

如果遇到 `exec /bin/sh: exec format error`，说明 Docker 镜像架构不匹配。

对于 x86_64 EC2，确保所有镜像使用 `linux/amd64`：

```bash
# 修复 tag-images.sh 中的 arm64 为 amd64
sed -i 's/--platform linux\/arm64 --build-arg PLATFORM_ARG=linux\/arm64/--platform linux\/amd64 --build-arg PLATFORM_ARG=linux\/amd64/g' /data/clickstream-lakehouse/deployment/tag-images.sh

# 移除 docker push 的 --platform 参数
sed -i 's/ --platform linux\/amd64//g; s/ --platform linux\/arm64//g' /data/clickstream-lakehouse/deployment/tag-images.sh
```

### 手动执行 tag-images.sh

如果部署脚本在 Docker 推送阶段失败，可以手动执行：

```bash
cd /home/ec2-user/clickstream-analytics/deployment

sudo AWS_SHARED_CREDENTIALS_FILE=/home/ec2-user/.aws/credentials \
     AWS_CONFIG_FILE=/home/ec2-user/.aws/config \
     bash tag-images.sh
```

## 第八步：上传 Lambda 代码包到区域 S3 Bucket

部署脚本会创建两个 S3 bucket：
- `clickstream-templates-<hash>` - 存放 CloudFormation 模板
- `clickstream-templates-<hash>-<region>` - 存放 Lambda 代码包

如果部署脚本中断，需要手动上传 Lambda 代码包：

```bash
cd /home/ec2-user/clickstream-analytics/deployment

# 上传 Lambda 代码包到区域 bucket（替换 <hash> 为实际值）
aws s3 sync regional-s3-assets/ s3://clickstream-templates-<hash>-us-east-1/clickstream-analytics-on-aws/v1.2.1/ --region us-east-1

# 验证上传
aws s3 ls s3://clickstream-templates-<hash>-us-east-1/clickstream-analytics-on-aws/v1.2.1/ | head -10
```

## 第九步：执行 CDK 部署

镜像推送成功后，执行 CDK 部署：

```bash
cd /home/ec2-user/clickstream-analytics

sudo AWS_SHARED_CREDENTIALS_FILE=/home/ec2-user/.aws/credentials \
     AWS_CONFIG_FILE=/home/ec2-user/.aws/config \
     npx cdk deploy cloudfront-s3-control-plane-stack-global \
     --require-approval never \
     --parameters Email=<your-email@example.com>
```

## 第十步：验证控制平面部署

```bash
# 检查 CloudFormation 堆栈状态
aws cloudformation describe-stacks --stack-name cloudfront-s3-control-plane-stack-global --query 'Stacks[0].StackStatus'

# 获取 CloudFront URL
aws cloudformation describe-stacks --stack-name cloudfront-s3-control-plane-stack-global --query 'Stacks[0].Outputs[?OutputKey==`ControlPlaneUrl`].OutputValue' --output text
```

## 第十一步：配置 VPC Endpoint（创建数据管道前必须）

创建数据管道时，Lambda 函数需要访问 AWS Glue 服务。如果你的 VPC 中已有 Glue VPC Endpoint，需要确保它包含数据管道使用的子网。

### 检查现有 VPC Endpoints

```bash
# 列出 VPC 中的 Endpoints
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=<your-vpc-id>" --query 'VpcEndpoints[*].[ServiceName,SubnetIds]' --output table
```

### 修改 Glue VPC Endpoint 子网

如果 Glue Endpoint 存在但子网不匹配，需要替换为数据管道使用的子网：

```bash
# 替换子网（同一可用区只能有一个子网）
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id <glue-endpoint-id> \
  --remove-subnet-ids <old-subnet-in-az-a> <old-subnet-in-az-b> \
  --add-subnet-ids <new-subnet-in-az-a> <new-subnet-in-az-b> \
  --region us-east-1
```

### 创建新的 Glue VPC Endpoint（如果不存在）

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id <your-vpc-id> \
  --service-name com.amazonaws.us-east-1.glue \
  --vpc-endpoint-type Interface \
  --subnet-ids <subnet-az-a> <subnet-az-b> \
  --security-group-ids <security-group-id> \
  --private-dns-enabled \
  --region us-east-1
```

## 第十二步：创建数据管道

1. 访问 CloudFront URL 打开 Web 控制台
2. 使用部署时指定的邮箱接收临时密码
3. 首次登录后修改密码
4. 创建项目和数据管道
5. 选择正确的 VPC 和子网（确保与 VPC Endpoint 配置的子网一致）

## 常见问题排查

### 权限问题 (EACCES)

如果遇到 `EACCES` 权限错误：

```bash
# 清理 node_modules 并重新安装
sudo rm -rf node_modules
sudo rm -rf /home/ec2-user/clickstream-analytics/node_modules
pnpm install
```

### AWS 凭证在 sudo 下不可用

始终使用环境变量传递凭证：

```bash
sudo AWS_SHARED_CREDENTIALS_FILE=/home/ec2-user/.aws/credentials \
     AWS_CONFIG_FILE=/home/ec2-user/.aws/config \
     <command>
```

### 模板 URL 包含占位符

如果数据管道创建失败，检查 Lambda 日志是否有 `TemplateURL must be a supported URL` 错误。这表示使用了 `npx cdk deploy` 而不是 `solution-deploy.sh`，导致模板 URL 占位符未被替换。

解决方案：使用 `solution-deploy.sh` 重新部署。

### Lambda 代码包缺失 (NoSuchKey)

如果 CloudFormation 报错 `S3 Error Code: NoSuchKey`，说明 Lambda 代码包未上传到区域 S3 bucket。

解决方案：执行第八步手动上传 Lambda 代码包。

### Lambda 连接超时 (Socket timed out)

如果数据管道创建失败，CloudFormation 事件显示 `Socket timed out without establishing a connection`，说明 Lambda 函数无法访问 AWS 服务。

原因：Lambda 在 VPC 私有子网中运行，但 VPC Endpoint 未包含该子网。

解决方案：执行第十一步配置 VPC Endpoint。

## 清理资源

```bash
# 先删除数据管道（在 Web 控制台操作）

# 删除控制平面 CloudFormation 堆栈
aws cloudformation delete-stack --stack-name cloudfront-s3-control-plane-stack-global

# 等待删除完成
aws cloudformation wait stack-delete-complete --stack-name cloudfront-s3-control-plane-stack-global
```
