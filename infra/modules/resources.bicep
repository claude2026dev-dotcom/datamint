targetScope = 'resourceGroup'

@description('Name of the azd environment')
param environmentName string

@description('Primary region for App Service, SQL Database, and Key Vault')
param location string = resourceGroup().location

@description('Region for the Static Web App free tier')
param swaLocation string

param principalId string
param principalName string

@allowed(['User', 'Group', 'Application'])
param principalType string = 'User'

param tags object = {}

var resourceSuffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 6)
var apiName = 'datamint-api-${resourceSuffix}'
var webName = 'datamint-web-${resourceSuffix}'
var planName = 'datamint-plan-${resourceSuffix}'
var sqlServerName = 'datamint-sql-${resourceSuffix}'
var sqlDatabaseName = 'DatamintDb'
var kvName = 'dm-kv-${resourceSuffix}'

// ---------- Key Vault ----------
// RBAC authorization (not access policies), soft-delete + purge protection required by
// this org's IaC standards - never disable purge protection even on a staging vault.
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

// Secret VALUES are supplied at provision time via `azd env set` (never hardcoded here,
// never committed) - see azure.yaml preprovision hook / README for the exact variable names.
@secure()
param jwtSecret string
@secure()
param emailPassword string
@secure()
param claudeApiKey string
@secure()
param openAiApiKey string

resource secretJwt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'jwt-secret'
  properties: { value: jwtSecret }
}
resource secretEmailPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'email-password'
  properties: { value: emailPassword }
}
resource secretClaudeKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'claude-api-key'
  properties: { value: claudeApiKey }
}
resource secretOpenAiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'openai-api-key'
  properties: { value: openAiApiKey }
}

// ---------- SQL Database (Entra-only auth - no admin login/password anywhere) ----------
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  tags: tags
  properties: {
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: principalType
      login: principalName
      sid: principalId
      tenantId: subscription().tenantId
      azureADOnlyAuthentication: true
    }
    minimalTlsVersion: '1.2'
  }
}

// Serverless Gen5, opted into Azure SQL's free monthly offer (100K vCore-seconds + 32GB -
// one per subscription). If this subscription isn't eligible for the free offer, provisioning
// will fail here rather than silently falling back to a billed tier.
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  tags: tags
  sku: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    autoPauseDelay: 60
    minCapacity: json('0.5')
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
  }
}

resource sqlFirewallAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------- App Service (Linux, .NET 8, F1 Free) ----------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'F1'
    tier: 'Free'
  }
  properties: {
    reserved: true
  }
}

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: apiName
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      // F1 (Free) does not support Always On - omit/false, not an oversight.
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      healthCheckPath: '/health'
      appSettings: [
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'ConnectionStrings__DefaultConnection', value: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${sqlDatabaseName};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;' }
        { name: 'Jwt__Secret', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=jwt-secret)' }
        { name: 'Jwt__Issuer', value: 'Datamint.API' }
        { name: 'Jwt__Audience', value: 'Datamint.Client' }
        { name: 'Email__Password', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=email-password)' }
        { name: 'Claude__ApiKey', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=claude-api-key)' }
        { name: 'OpenAI__ApiKey', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=openai-api-key)' }
        { name: 'FileStorage__UploadsRootPath', value: '/home/uploads' }
        { name: 'App__ApiBaseUrl', value: 'https://${apiName}.azurewebsites.net' }
        { name: 'App__FrontendBaseUrl', value: 'https://${web.properties.defaultHostname}' }
        { name: 'Cors__AllowedOrigins__0', value: 'https://${web.properties.defaultHostname}' }
      ]
    }
  }
}

resource apiSlotConfig 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: api
  name: 'logs'
  properties: {
    applicationLogs: {
      fileSystem: { level: 'Information' }
    }
    httpLogs: {
      fileSystem: { retentionInMb: 35, enabled: true }
    }
  }
}

// ---------- Static Web App (Angular frontend, Free tier) ----------
resource web 'Microsoft.Web/staticSites@2023-12-01' = {
  name: webName
  location: swaLocation
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    provider: 'None'
  }
}

// ---------- Key Vault access for the API's managed identity ----------
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, api.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Grants CONTROL-plane SQL access (the resource exists / can be managed) - actual DATA-plane
// access (CREATE USER ... FROM EXTERNAL PROVIDER + role membership) is granted by the
// postprovision hook script (scripts/grant-sql-access.*), which this Bicep alone cannot do.
resource sqlContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sqlServer.id, api.id, 'SQL DB Contributor')
  scope: sqlServer
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '9b7fa17d-e63e-47b0-bb0a-15c516ac86ec')
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output apiUrl string = 'https://${api.properties.defaultHostName}'
output webUrl string = 'https://${web.properties.defaultHostname}'
output keyVaultName string = keyVault.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabaseName
output apiName string = api.name
output webName string = web.name
