import {
  AccountResetter,
  CategoryCollector,
  DetailCollector,
  DraftCollector,
  InvalidCarRemover
} from "./automations"
import { BatchClient } from "./aws"
import { envs } from "./configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "./db"
import {
  AccountResetService,
  CarAssignService,
  CarCollectService,
  CarUploadService,
  CategoryService,
  UploadedCarRemoveService,
  UploadedCarSyncService
} from "./services"
import { CategoryInitializer, PageInitializer } from "./utils"


const {
  BCAR_CATEGORY_INDEX,
  BCAR_CATEGORY_TABLE,
  BCAR_INDEX,
  BCAR_TABLE,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  JOB_DEFINITION_NAME,
  SYNC_JOB_QUEUE_NAME,
  UPLOAD_JOB_QUEUE_NAME,
  REGION,
  SOURCE_ADMIN_ID,
  SOURCE_ADMIN_PW,
  SOURCE_LOGIN_PAGE,
  SOURCE_MANAGE_PAGE,
  SOURCE_SEARCH_BASE,
  SOURCE_SEARCH_TRUCK_BASE,
  SOURCE_SEARCH_BUS_BASE,
} = envs

// Collectors
const draftCollector = new DraftCollector(
  SOURCE_ADMIN_ID,
  SOURCE_ADMIN_PW,
  SOURCE_LOGIN_PAGE,
  SOURCE_MANAGE_PAGE,
  SOURCE_SEARCH_BASE,
  SOURCE_SEARCH_TRUCK_BASE,
  SOURCE_SEARCH_BUS_BASE,
  )
const detailCollector = new DetailCollector()
const categoryCollector = new CategoryCollector()
// const accountResetter = new AccountResetter()
// const invalidCarRemover = new InvalidCarRemover()
// Repositories
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
// SpreadSheet Client
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
// Category Map Creator
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
// Batch Trigger
const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)

// Services
const carCollectService = new CarCollectService(draftCollector, detailCollector, dynamoCarClient)
const carAssignService = new CarAssignService(dynamoCarClient, dynamoUploadedCarClient)
const uploadedCarSyncService = new UploadedCarSyncService(dynamoUploadedCarClient, sheetClient)
const carUploadService = new CarUploadService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)
const categoryService = new CategoryService(sheetClient, categoryCollector, dynamoCategoryClient)
// const accountResetService = new AccountResetService(sheetClient, dynamoUploadedCarClient, accountResetter)
// const uploadedCarRemoveService = new UploadedCarRemoveService(sheetClient, dynamoUploadedCarClient, invalidCarRemover)

// VCPU: 2.0 / MEMORY: 4096
async function collectDrafts() {
  const shouldTriggerDetail = await carCollectService.collectDrafts()
  if (!shouldTriggerDetail) {
    console.log("Nothing cars have been changed. end execution.")
    return
  }

  const response = await batchClient.submitSyncJob({
    jobName: collectDetails.name,
    command: ["node", "/app/dist/src/index.js", collectDetails.name],
    timeout: 60 * 30,
    attempts: 3
  })
  if (response.$metadata.httpStatusCode !== 200) {
    console.error(response)
  }
}

// VCPU: 2.0 / MEMORY: 4096
async function collectDetails() {
  await carCollectService.collectDetails()
  const response = await batchClient.submitSyncJob({
    jobName: manageCars.name,
    command: ["node", "/app/dist/src/index.js", manageCars.name],
    attempts: 3
  })
  if (response.$metadata.httpStatusCode !== 200) {
    console.error(response)
  }
}

// VCPU: 1.0 / MEMORY: 2048
async function manageCars() {
  const [accounts, { segmentMap, companyMap }] = await Promise.all([
    sheetClient.getAccounts(),
    categoryInitializer.initializeMaps(),
  ])
  await carAssignService.releaseExceededCars(accounts, segmentMap, companyMap)
  await carAssignService.assignCars(accounts, segmentMap, companyMap)

  for (const account of accounts) {
    const carNumbersNotUploaded = await dynamoUploadedCarClient.queryCarNumbersByIdAndIsUploaded(account.id, false)
    if (!carNumbersNotUploaded.length) {
      console.log(`${account.id} has nothing to upload`)
      continue
    }

    await batchClient.submitUploadJob({
      jobName: `${syncAndUploadCars.name}-${account.id}`,
      command: ["node", "/app/dist/src/index.js", syncAndUploadCars.name],
      environment: [{ name: "KCR_ID", value: account.id }],
      timeout: 60 * 30,
      attempts: 3
    })
  }
}

// VCPU: 2.0 / MEMORY: 4096
async function syncAndUploadCars() {
  const kcrId = process.env.KCR_ID
  if (!kcrId) {
    throw new Error("No id env");
  }

  await uploadedCarSyncService.syncCarsById(kcrId)
  await carUploadService.uploadCarById(kcrId)

  const carNumbersAfterUpload = await dynamoUploadedCarClient.queryCarNumbersByIdAndIsUploaded(kcrId, false)
  if (carNumbersAfterUpload.length) {
    console.error("There is more cars to be uploaded. exit 1 for retry.")
    process.exit(1)
  }
}

// // VCPU: 1.0 / MEMORY: 2048
// async function resetAllUploadedCarAsFalse() {
//   await accountResetService.resetAll()
// }

// // VCPU: 1.0 / MEMORY: 2048
// async function resetUploadedCarAsFalse() {
//   await accountResetService.resetByEnv()
// }

// // VCPU: 1.0 / MEMORY: 2048
// async function removeInvalidImageUploadedCars() {
//   await uploadedCarRemoveService.removeByEnv()
// }
// async function removeAllInvalidImageUploadedCars() {
//   await uploadedCarRemoveService.removeAll()
// }

// VCPU: 1.0 / MEMORY: 2048
async function collectCategory() {
  await categoryService.collectCategoryInfo()
}

async function login() {
  const id = process.env.KCR_ID
  if (!id) {
    throw new Error("No id env");
  }

  const { account, regionUrl } = await sheetClient.getAccountAndRegionUrlById(id)
  const { loginUrlRedirectManage } = regionUrl
  const page = await PageInitializer.createPage()
  await PageInitializer.loginKcr(page, loginUrlRedirectManage, account.id, account.pw)
}

const functionMap = new Map<string, Function>([
  [collectDrafts.name, collectDrafts],  // 1
  [collectDetails.name, collectDetails],  // 2
  [manageCars.name, manageCars],  // 3
  [syncAndUploadCars.name, syncAndUploadCars],  // 4
  [collectCategory.name, collectCategory],
  [login.name, login],
  // [resetAllUploadedCarAsFalse.name, resetAllUploadedCarAsFalse],
  // [resetUploadedCarAsFalse.name, resetUploadedCarAsFalse],
  // [removeAllInvalidImageUploadedCars.name, removeAllInvalidImageUploadedCars],
  // [removeInvalidImageUploadedCars.name, removeInvalidImageUploadedCars],
])

const fc = functionMap.get(process.argv[2])

  if (!fc) {
    console.error("[Function list]");
    console.error("--------------------------------");
    console.error(Array.from(functionMap.keys()).join("\n"));
    console.error("--------------------------------\n");
    console.error();
    throw new Error("There is not matched function");
  }

  (async ()=>{
    const startTime = Date.now()
    await fc()
    const endTime = Date.now()
    const executionTime = Math.ceil((endTime - startTime) / 1000)
    console.log(`Execution time : ${executionTime}(s)`);
  })()
