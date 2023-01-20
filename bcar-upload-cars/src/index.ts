import { existsSync } from "node:fs"
import { mkdir, rm } from "fs/promises"
import { BrowserInitializer, CategoryCrawler, DetailCollector, DraftCollector } from "./automations"
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
  NODE_ENV,
  REGION,
  SOURCE_ADMIN_ID,
  SOURCE_ADMIN_PW,
  SOURCE_LOGIN_PAGE,
} = envs

const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, JOB_QUEUE_NAME)
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
const draftCollector = new DraftCollector(SOURCE_ADMIN_ID, SOURCE_ADMIN_PW, SOURCE_LOGIN_PAGE)
const detailCollector = new DetailCollector()
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const initializer = new BrowserInitializer(NODE_ENV)
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
const crawler = new CategoryCrawler(initializer)

// VCPU: 1.0 / MEMORY: 2048
async function collectDrafts() {
  const carCollectService = new CarCollectService(draftCollector, detailCollector, dynamoCarClient)
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
  const carCollectService = new CarCollectService(draftCollector, detailCollector, dynamoCarClient)
  await carCollectService.collectDetails()
}

// VCPU: 1.0 / MEMORY: 2048
async function manageCars() {
  const assignService = new CarAssignService(
    sheetClient,
    dynamoCarClient,
    dynamoUploadedCarClient,
    categoryInitializer,
  )
  await assignService.assign()

  const accountMap = await assignService.getAccountMap()
  const userIDs = Array.from(accountMap.keys())
  console.log(userIDs)

  const responses = await Promise.all(
    userIDs.map(id=>batchClient.submitJob(
      `${syncCar.name}-${id}`,
      {
        command: ["node", "/app/dist/src/index.js", syncCar.name],
        environment: [{ name: "KCR_ID", value: id }],
      }
    ))
  )
  console.log(responses);
}

// VCPU: 2.0 / MEMORY: 4096
async function syncCar() {
  const syncService = new UploadedCarSyncService(
    dynamoUploadedCarClient,
    sheetClient,
    initializer,
  )
  await syncService.syncCarsByEnv()

  const kcrId = process.env.KCR_ID
  if (!kcrId) throw new Error("No id env")

  const response = await batchClient.submitJob(
    `${uploadCar.name}-${kcrId}`,
    {
      command: ["node", "/app/dist/src/index.js", uploadCar.name],
      environment: [{ name: "KCR_ID", value: kcrId }],
    }
  )
  console.log(response)
}

// VCPU: 2.0 / MEMORY: 4096
async function uploadCar() {
  const carUploadService = new CarUploadService(
    sheetClient,
    dynamoCarClient,
    dynamoUploadedCarClient,
    initializer,
    categoryInitializer,
  )

  try {
    await carUploadService.uploadCarByEnv()
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.name);
      console.error(error.message);
      console.error(error.stack);
    }
  } finally {
    await initializer.closePages()
  }
}

// VCPU: 1.0 / MEMORY: 2048
async function crawlCategories() {
  const categoryService = new CategoryService(sheetClient, crawler, dynamoCategoryClient)

  try {
    await categoryService.collectCategoryInfo()
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.name);
      console.error(error.message);
      console.error(error.stack);
    }
  } finally {
    await initializer.closePages()
  }
}

// VCPU: 0.25 / MEMORY: 512
async function checkIPAddress() {
  const response = await fetch('http://api.ipify.org/?format=json')
  const body = await response.json()
  console.log(body.ip);
}

// VCPU: 0.25 / MEMORY: 512
async function getCarNumbers() {
  const carNumbers = await dynamoCarClient.queryCars(["CarNumber"])
  console.log(carNumbers);
  console.log(carNumbers.length);
}

// VCPU: 0.25 / MEMORY: 512
async function getUpdatedCarNumbers() {
  const carNumbers = await dynamoUploadedCarClient.segmentScanUploadedCar(10, ["PK", "SK"])
  console.log(carNumbers);
  console.log(carNumbers.length);
}

const functionMap = new Map<string, Function>([
  [collectDrafts.name, collectDrafts],  // 1
  [triggerCollectingDetails.name, triggerCollectingDetails],  // 1-2
  [collectDetails.name, collectDetails],  // 2
  [manageCars.name, manageCars],  // 3
  [syncCar.name, syncCar],  // 4
  [uploadCar.name, uploadCar],  // 5

  [crawlCategories.name, crawlCategories],
  [checkIPAddress.name, checkIPAddress],
  [getCarNumbers.name, getCarNumbers],
  [getUpdatedCarNumbers.name, getUpdatedCarNumbers],
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

