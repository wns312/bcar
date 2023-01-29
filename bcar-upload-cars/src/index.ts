import { existsSync } from "node:fs"
import { mkdir, rm } from "fs/promises"
import { AccountResetter, CategoryCollector, DetailCollector, DraftCollector, InvalidCarRemover } from "./automations"
import { BatchClient } from "./aws"
import { envs } from "./configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "./db"
import { AccountResetService, CarAssignService, CarCollectService, CarUploadService, CategoryService, UploadedCarRemoveService, UploadedCarSyncService } from "./services"
import { CategoryInitializer } from "./utils"

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
} = envs

// Collectors
const draftCollector = new DraftCollector(SOURCE_ADMIN_ID, SOURCE_ADMIN_PW, SOURCE_LOGIN_PAGE, SOURCE_MANAGE_PAGE, SOURCE_SEARCH_BASE)
const detailCollector = new DetailCollector()
const categoryCollector = new CategoryCollector()
const accountResetter = new AccountResetter()
const invalidCarRemover = new InvalidCarRemover()
// Repositories
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
// SpreadSheet Client
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
// Category Map Creator
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
// Batch Trigger
const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME)

// Services
const carCollectService = new CarCollectService(draftCollector, detailCollector, dynamoCarClient)
const carAssignService = new CarAssignService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)
const uploadedCarSyncService = new UploadedCarSyncService(dynamoUploadedCarClient, sheetClient)
const carUploadService = new CarUploadService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)
const categoryService = new CategoryService(sheetClient, categoryCollector, dynamoCategoryClient)
const accountResetService = new AccountResetService(sheetClient, dynamoUploadedCarClient, accountResetter)
const uploadedCarRemoveService = new UploadedCarRemoveService(sheetClient, dynamoUploadedCarClient, invalidCarRemover)

// VCPU: 1.0 / MEMORY: 2048
async function collectDrafts() {
  await carCollectService.collectDrafts()
  await triggerCollectingDetails()
}

// VCPU: 0.25 / MEMORY: 512
async function triggerCollectingDetails() {
  const response = await batchClient.submitJob({
    jobName: collectDetails.name,
    command: ["node", "/app/dist/src/index.js", collectDetails.name],
    timeout: 60 * 30,
  })
  console.log(response)
}

// VCPU: 2.0 / MEMORY: 4096
async function collectDetails() {
  await carCollectService.collectDetails()
}

// VCPU: 1.0 / MEMORY: 2048
async function manageCars() {
  await carAssignService.assign()

  const accountIndexMap = await sheetClient.getAccountIndexMap()
  const firstAccount = accountIndexMap.get(1)
  if (!firstAccount) {
    throw new Error("There is no first account")
  }

  console.log(`Submit first account: ${firstAccount.id}`);

  const response = await batchClient.submitJob({
    jobName: `${syncCars.name}-${firstAccount.id}`,
    command: ["node", "/app/dist/src/index.js", syncCars.name],
    environment: [{ name: "KCR_ID", value: firstAccount.id }],
  })
  console.log(response)
}

// VCPU: 2.0 / MEMORY: 4096
async function syncCars() {
  const kcrId = process.env.KCR_ID
  if (!kcrId) {
    throw new Error("No id env");
  }
  await uploadedCarSyncService.syncCarsById(kcrId)

  const response = await batchClient.submitJob({
    jobName: `${uploadCars.name}-${kcrId}`,
    command: ["node", "/app/dist/src/index.js", uploadCars.name],
    environment: [{ name: "KCR_ID", value: kcrId }],
    timeout: 60 * 30,
    attempts: 3
  })
  console.log(response)
}


// VCPU: 2.0 / MEMORY: 4096
async function uploadCars() {
  const kcrId = process.env.KCR_ID
  if (!kcrId) {
    throw new Error("No id env");
  }
  await carUploadService.uploadCarById(kcrId)
  await uploadedCarSyncService.syncCarsById(kcrId)

  const carNumbers = await dynamoUploadedCarClient.queryCarNumbersById(kcrId)
  if (carNumbers.length) {
    throw new Error("There is more cars to be uploaded. throw error for retry.")
  }

  const nextAccount = await sheetClient.getNextAccount(kcrId)
  if (!nextAccount) {
    console.log("There is no next account. end execution.")
    return
  }

  console.log(`Execute next sync: ${nextAccount.id}`)

  const response = await batchClient.submitJob({
    jobName: `${syncCars.name}-${nextAccount.id}`,
    command: ["node", "/app/dist/src/index.js", syncCars.name],
    environment: [{ name: "KCR_ID", value: nextAccount.id }],
  })
  console.log(response)
}


// VCPU: 1.0 / MEMORY: 2048
async function resetAllUploadedCarAsFalse() {
  await accountResetService.resetAll()
}

// VCPU: 1.0 / MEMORY: 2048
async function resetUploadedCarAsFalse() {
  await accountResetService.resetByEnv()
}

// VCPU: 1.0 / MEMORY: 2048
async function removeInvalidImageUploadedCars() {
  await uploadedCarRemoveService.removeByEnv()
}
async function removeAllInvalidImageUploadedCars() {
  await uploadedCarRemoveService.removeAll()
}

// VCPU: 1.0 / MEMORY: 2048
async function collectCategory() {
  await categoryService.collectCategoryInfo()
}

async function test() {
  const [margin, comment] = await Promise.all([
    sheetClient.getMargin(),
    sheetClient.getComment(),
  ])
  console.log(margin)
  console.log(comment)

}


const functionMap = new Map<string, Function>([
  [collectDrafts.name, collectDrafts],  // 1
  [triggerCollectingDetails.name, triggerCollectingDetails],  // 1-2
  [collectDetails.name, collectDetails],  // 2
  [manageCars.name, manageCars],  // 3
  [syncCars.name, syncCars],  // 4
  [uploadCars.name, uploadCars],  // 5

  [resetAllUploadedCarAsFalse.name, resetAllUploadedCarAsFalse],
  [resetUploadedCarAsFalse.name, resetUploadedCarAsFalse],
  [removeAllInvalidImageUploadedCars.name, removeAllInvalidImageUploadedCars],
  [removeInvalidImageUploadedCars.name, removeInvalidImageUploadedCars],
  [collectCategory.name, collectCategory],
  [test.name, test],
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
  await rm('./images/*', { recursive: true, force: true })
  if(!existsSync("./images")) {
    await mkdir("./images")
  }
  const startTime = Date.now()
  await fc()
  const endTime = Date.now()
  const executionTime = Math.ceil((endTime - startTime) / 1000)
  console.log(`Execution time : ${executionTime}(s)`);
})()

