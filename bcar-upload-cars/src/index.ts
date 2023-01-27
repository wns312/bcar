import { existsSync } from "node:fs"
import { mkdir, rm } from "fs/promises"
import { CategoryCollector, DetailCollector, DraftCollector } from "./automations"
import { BatchClient } from "./aws"
import { envs } from "./configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "./db"
import { CarAssignService, CarCollectService, CarUploadService, CategoryService, UploadedCarSyncService } from "./services"
import { CategoryInitializer } from "./utils"

const {
  BCAR_CATEGORY_INDEX,
  BCAR_CATEGORY_TABLE,
  BCAR_INDEX,
  BCAR_TABLE,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  JOB_DEFINITION_NAME,
  JOB_QUEUE_NAME,
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
// Repositories
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
// SpreadSheet Client
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
// Category Map Creator
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
// Batch Trigger
const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, JOB_QUEUE_NAME)

// Services
const carCollectService = new CarCollectService(draftCollector, detailCollector, dynamoCarClient)
const carAssignService = new CarAssignService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)
const uploadedCarSyncService = new UploadedCarSyncService(dynamoUploadedCarClient, sheetClient)
const carUploadService = new CarUploadService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)
const categoryService = new CategoryService(sheetClient, categoryCollector, dynamoCategoryClient)

// VCPU: 1.0 / MEMORY: 2048
async function collectDrafts() {
  await carCollectService.collectDrafts()
  await triggerCollectingDetails()
}

// VCPU: 0.25 / MEMORY: 512
async function triggerCollectingDetails() {
  const response = await batchClient.submitJob(
    collectDetails.name,
    {
      command: ["node", "/app/dist/src/index.js", collectDetails.name],
      timeout: 60 * 30,
    }
  )
  console.log(response)
}

// VCPU: 2.0 / MEMORY: 4096
async function collectDetails() {
  await carCollectService.collectDetails()
}

// VCPU: 1.0 / MEMORY: 2048
async function manageCars() {
  await carAssignService.assign()

  const accountMap = await carAssignService.getAccountMap()
  const userIDs = Array.from(accountMap.keys())
  console.log(userIDs)

  const responses = await Promise.all(
    userIDs.map(id=>batchClient.submitJob(
      `${syncCars.name}-${id}`,
      {
        command: ["node", "/app/dist/src/index.js", syncCars.name],
        environment: [{ name: "KCR_ID", value: id }],
      }
    ))
  )
  console.log(responses);
}

// VCPU: 2.0 / MEMORY: 4096
async function syncCars() {
  await uploadedCarSyncService.syncCarsByEnv()

  const kcrId = process.env.KCR_ID
  if (!kcrId) throw new Error("No id env")

  const response = await batchClient.submitJob(
    `${uploadCar.name}-${kcrId}`,
    {
      command: ["node", "/app/dist/src/index.js", uploadCar.name],
      environment: [{ name: "KCR_ID", value: kcrId }],
      timeout: 60 * 30,
      attempts: 3
    }
  )
  console.log(response)
}

// VCPU: 2.0 / MEMORY: 4096
async function uploadCar() {
  await carUploadService.uploadCarByEnv()
  await uploadedCarSyncService.syncCarsByEnv()
}

// VCPU: 1.0 / MEMORY: 2048
async function collectCategory() {
  await categoryService.collectCategoryInfo()
}

// VCPU: 0.25 / MEMORY: 512
async function checkIPAddress() {
  const response = await fetch('http://api.ipify.org/?format=json')
  const body = await response.json()
  console.log(body.ip);
}

// VCPU: 0.25 / MEMORY: 512
async function getCarAmount() {
  const cars = await dynamoCarClient.queryCars()
  console.log(cars);
  console.log(cars.length);
}

// VCPU: 0.25 / MEMORY: 512
async function getUploadedCarAmount() {
  const uploadedCars = await dynamoUploadedCarClient.queryAll()
  console.log(uploadedCars);
  console.log(uploadedCars.length);
}

const functionMap = new Map<string, Function>([
  [collectDrafts.name, collectDrafts],  // 1
  [triggerCollectingDetails.name, triggerCollectingDetails],  // 1-2
  [collectDetails.name, collectDetails],  // 2
  [manageCars.name, manageCars],  // 3
  [syncCars.name, syncCars],  // 4
  [uploadCar.name, uploadCar],  // 5

  [collectCategory.name, collectCategory],
  [checkIPAddress.name, checkIPAddress],
  [getCarAmount.name, getCarAmount],
  [getUploadedCarAmount.name, getUploadedCarAmount],
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

