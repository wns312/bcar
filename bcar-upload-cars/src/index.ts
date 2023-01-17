import { existsSync } from "node:fs"
import { mkdir, rm } from "fs/promises"
import { BrowserInitializer, CategoryCrawler, SourceCollector } from "./automations"
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
  SOURCE_MANAGE_PAGE,
  SOURCE_DETAIL_PAGE_BASE,
} = envs

const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, JOB_QUEUE_NAME)
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const initializer = new BrowserInitializer(NODE_ENV)
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
const crawler = new CategoryCrawler(initializer)

// 미완성
// VCPU: 1.0 / MEMORY: 2048
async function collectCars() {
  const sourceCollector = new SourceCollector(SOURCE_ADMIN_ID, SOURCE_ADMIN_PW, SOURCE_LOGIN_PAGE)
  const carCollectService = new CarCollectService(sourceCollector, dynamoCarClient)
  await carCollectService.collect()
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
        command: ["node", "/app/dist/src/index.js", `${syncCar.name}-${id}`],
        environment: [{ name: "KCR_ID", value: id }],
      }
    ))
  )
  console.log(responses);
}

// VCPU: 1.0 / MEMORY: 2048
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
      command: ["node", "/app/dist/src/index.js", `${uploadCar.name}-${kcrId}`],
      environment: [{ name: "KCR_ID", value: kcrId }],
      vcpu: 2,
      memory: 4096
    }
  )
  console.log(response)
}

// VCPU: 2.0~4.0 / MEMORY: 4096~8192
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

const functionMap = new Map<string, Function>([
  [collectCars.name, collectCars],
  [manageCars.name, manageCars],
  [syncCar.name, syncCar],
  [uploadCar.name, uploadCar],
  [crawlCategories.name, crawlCategories],
  [checkIPAddress.name, checkIPAddress],
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
  await fc()
})()

