import { existsSync } from "node:fs"
import { mkdir, rm } from "fs/promises"
import { BrowserInitializer, CategoryCrawler } from "./automations"
import { BatchClient } from "./aws"
import { envs } from "./configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "./db"
import { CarAssignService, CarUploadService, CategoryService, UploadedCarSyncService } from "./services"
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
} = envs

const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, JOB_QUEUE_NAME)
const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
const initializer = new BrowserInitializer(NODE_ENV)
const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
const crawler = new CategoryCrawler(initializer)

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
    userIDs.map(id=>batchClient.submitFunction(id, syncCar.name))
  )
  console.log(responses);
}

async function syncCar() {
  const syncService = new UploadedCarSyncService(
    dynamoUploadedCarClient,
    sheetClient,
    initializer,
  )
  await syncService.syncCarsByEnv()

  const kcrId = process.env.KCR_ID
  if (!kcrId) throw new Error("No id env")

  const response = await batchClient.submitFunction(kcrId, uploadCar.name)
  console.log(response)
}

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

async function checkIPAddress() {
  const response = await fetch('http://api.ipify.org/?format=json')
  const body = await response.json()
  console.log(body.ip);
}

const functionMap = new Map<string, Function>([
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

