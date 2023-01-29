import { existsSync } from 'node:fs';
import { mkdir, rm } from "fs/promises"
import { Page } from "puppeteer"
import { CarUploader } from "../automations"
import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, RegionUrl } from "../entities"
import { UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk, PageInitializer } from "../utils"
import { Car } from '../entities';

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
    const [comment, margin] = await Promise.all([
      this.sheetClient.getComment(),
      this.sheetClient.getMargin(),
    ])
    const carUploader = new CarUploader(page, id, comment, margin, registerUrl, chunkCars)
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

  async uploadCarById(id: string, worker: number = 3) {
    const [cars, { segmentMap, companyMap }, { account, regionUrl }] = await Promise.all([
      this.getUserCars(id),
      this.categoryInitializer.initializeMaps(),
      this.sheetClient.getAccountAndRegionUrl(id)
    ])
    if (!cars.length) {
      console.log("Nothing to upload. end execution", id)
      return
    }

    const classifiedCars = new CarClassifier(cars, segmentMap, companyMap).classifyAll()

    const chunkedCars = chunk(classifiedCars, Math.ceil((classifiedCars.length / worker)))
    chunkedCars.forEach(chunk=>console.log(chunk.length))

    const rootDir = CarUploader.getImageRootDir(id)
    if(!existsSync(rootDir)) await mkdir(rootDir)
    const pages = await PageInitializer.createPages(chunkedCars.length)
    console.log("차량 업로드")

    try {
      const uploadResults = chunkedCars.map(
        (chunkCars, i)=>this.execute(pages[i], account, regionUrl, chunkCars)
      )
      await Promise.all(uploadResults)
    } catch(e) {
      await PageInitializer.closePages(pages)
      await rm(rootDir, { recursive: true, force: true })
      throw e
    }
    await PageInitializer.closePages(pages)
    await rm(rootDir, { recursive: true, force: true })
  }
}
