targetScope = 'subscription'

@description('Name of the azd environment (used to derive resource names)')
param environmentName string

@description('Primary region for App Service, SQL Database, and Key Vault')
param location string

@description('Region for the Static Web App - only westus2, centralus, eastus2, westeurope, eastasia support the free tier')
param swaLocation string = 'eastasia'

@description('Object ID of the signed-in user/principal deploying this template - becomes the SQL Entra admin')
param principalId string

@description('Display name of the signed-in user/principal deploying this template')
param principalName string

@allowed(['User', 'Group', 'Application'])
param principalType string = 'User'

@secure()
param jwtSecret string
@secure()
param emailPassword string
@secure()
param claudeApiKey string
@secure()
param openAiApiKey string

var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources './modules/resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    environmentName: environmentName
    location: location
    swaLocation: swaLocation
    principalId: principalId
    principalName: principalName
    principalType: principalType
    tags: tags
    jwtSecret: jwtSecret
    emailPassword: emailPassword
    claudeApiKey: claudeApiKey
    openAiApiKey: openAiApiKey
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output API_URL string = resources.outputs.apiUrl
output WEB_URL string = resources.outputs.webUrl
output SQL_SERVER string = resources.outputs.sqlServerFqdn
output SQL_DATABASE string = resources.outputs.sqlDatabaseName
output SERVICE_API_NAME string = resources.outputs.apiName
output SERVICE_WEB_NAME string = resources.outputs.webName
