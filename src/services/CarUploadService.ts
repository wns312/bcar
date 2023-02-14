import { Page } from "puppeteer"
import { CarUploader } from "../automations"
import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, Car, RegionUrl } from "../entities"
import { UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk, PageInitializer } from "../utils"

export class CarUploadService {
  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}

  private async getUserCars(id: string): Promise<Car[]> {
    const unUploadedCars = await this.dynamoUploadedCarClient.queryByIdAndIsUploaded(id, false)
    if (!unUploadedCars.length) {
      return []
    }
    const cars = await this.dynamoCarClient.QueryCarsByCarNumbers(unUploadedCars.map(car=>car.carNumber))
    return cars
  }


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
    if (!succeededSources.length) {
      console.log("No succeededSources to save");
      return
    }
    const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(
      id,
      succeededSources.map(source=>source.car.carNumber),
      true
    )
    responses.forEach(r=>{
      if (r.$metadata.httpStatusCode !== 200) {
        console.log(r)
      }
    })
  }

  async uploadCarById(id: string, worker: number = 4) {
    const [cars, { segmentMap, companyMap }, { account, regionUrl }] = await Promise.all([
      this.getUserCars(id),
      this.categoryInitializer.initializeMaps(),
      this.sheetClient.getAccountAndRegionUrlById(id)
    ])
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
