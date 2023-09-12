import { Page } from "puppeteer"
import { CarUploader } from "../automations"
import { SheetClient, DynamoCarClient } from "../db"
import { Account, RegionUrl } from "../entities"
import { UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk, PageInitializer } from "../utils"

export class CarUploadService {
  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}



  private async execute(
    page: Page, {id, pw}: Account, { loginUrlRedirectRegister, registerUrl }: RegionUrl, chunkCars: UploadSource[]
  ) {
    await PageInitializer.loginKcr(page, loginUrlRedirectRegister, id, pw)
    const [comment, marginMap] = await Promise.all([
      this.sheetClient.getComment(),
      this.sheetClient.getMargin(),
    ])
    const carUploader = new CarUploader(page, id, comment, marginMap, registerUrl, chunkCars)
    await carUploader.uploadCars()
    const { succeededSources, failedSources } = carUploader
    succeededSources.forEach((source)=> {
      source.car.isUploaded = true
    })
    await this.dynamoCarClient.batchSaveCar(succeededSources.map(source=>source.car))
  }

  async uploadCarById(id: string, worker: number = 3) {
    const cars = await this.dynamoCarClient.queryAssignedAndNotUploadedCarsByUploader(id)
    const { segmentMap, companyMap } = await this.categoryInitializer.initializeMaps()
    const { account, regionUrl } = await this.sheetClient.getAccountAndRegionUrlById(id)
    if (!cars.length) {
      console.log("Nothing to upload. end execution", id)
      return
    }

    const classifiedCars = new CarClassifier(cars, segmentMap, companyMap).classifyAll()
    const chunkedCars = chunk(classifiedCars, Math.ceil((classifiedCars.length / worker)))
    chunkedCars.forEach(chunk=>console.log(chunk.length))

    const pages = await PageInitializer.createPages(chunkedCars.length)
    console.log("차량 업로드")

    try {
      const uploadResults = chunkedCars.map(
        (chunkCars, i)=>this.execute(pages[i], account, regionUrl, chunkCars)
      )
      await Promise.all(uploadResults)
    } catch(e) {
      console.error(e)
    } finally {
      await PageInitializer.closePages(pages)
    }
  }
}
