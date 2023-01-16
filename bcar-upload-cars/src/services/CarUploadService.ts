import { existsSync } from 'node:fs';
import { mkdir, rm } from "fs/promises"
import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { Page } from "puppeteer"
import { BrowserInitializer, CarUploader } from "../automations"
import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, CarDataObject, KCRURL, UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk } from "../utils"

export class CarUploadService {

  _accountMap?: Map<string, Account>
  _urlMap?: Map<string, KCRURL>

  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private initializer: BrowserInitializer,
    private categoryInitializer: CategoryInitializer,
  ) {}

  // uploadCars 빼고 전부 이동되어야 할 메소드
  private static createCarObject(items: Record<string, AttributeValue>[]): CarDataObject[] {
    return items.map(item=>{
      return {
        PK: item.PK.S!,
        SK: item.SK.S!,
        carCheckSrc: item.CarCheckSrc.S!,
        modelYear: item.ModelYear.S!,
        presentationsDate: item.PresentationsDate.S!,
        displacement: item.Displacement.S!,
        mileage: item.Mileage.S!,
        carImgList: item.CarImgList ? item.CarImgList.SS! : [],
        hasMortgage: item.HasMortgage.BOOL!,
        hasSeizure: item.HasSeizure.BOOL!,
        title: item.Title.S!,
        fuelType: item.FuelType.S!,
        carNumber: item.CarNumber.S!,
        registerNumber: item.RegisterNumber.S!,
        presentationNumber: item.PresentationNumber.S!,
        price: Number.parseInt(item.Price.N!),
        hasAccident: item.HasAccident.S!,
        gearBox: item.GearBox.S!,
        color: item.Color.S!,
        company: item.Company.S!,
        category: item.Category.S!,
      }
    })
  }

  private async getUserCars(id: string): Promise<CarDataObject[]> {
    const updateCarsResult = await this.dynamoUploadedCarClient.queryByIdFilteredByIsUploaded(id, false)
    if (updateCarsResult.$metadata.httpStatusCode !== 200) {
      console.error(updateCarsResult);
      throw new Error("Response is not 200");
    }
    if (!updateCarsResult.Items!.length) {
      return []
    }

    const userCars = await this.dynamoCarClient.getCarsByIds(updateCarsResult.Items!.map(item=>item.SK.S!))
    const cars = CarUploadService.createCarObject(userCars)
    return cars
  }

  private async getAccountMap() {
    if (!this._accountMap) {
      const allUsers = await this.sheetClient.getAccounts()
      this._accountMap = new Map<string, Account>(allUsers.map(user=>[user.id, user]))
    }
    return this._accountMap!
  }

  private async getURLMap() {
    if (!this._urlMap) {
      const allUrls = await this.sheetClient.getKcrs()
      this._urlMap = new Map<string, KCRURL>(allUrls.map(urlObj=>[urlObj.region, urlObj]))
    }
    return this._urlMap!
  }

  private async execute(
    page: Page, {id, pw}: Account, { loginUrl, registerUrl }: KCRURL, chunkCars: UploadSource[]
  ) {
    await this.initializer.login(page, loginUrl + registerUrl, id, pw)

    const carUploader = new CarUploader(page, id, registerUrl, chunkCars)
    await carUploader.uploadCars()
    const { succeededSources, failedSources } = carUploader
    if (!succeededSources.length) {
      console.log("No succeededSources to save");
      return
    }
    const responses = await this.dynamoUploadedCarClient.batchSave(
      id,
      succeededSources.map(source=>source.car.carNumber),
      true
    )
    responses.forEach(r=>{ console.log(r) })
  }

  async uploadCarByEnv(worker: number = 3) {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.uploadCarById(kcrId, worker)
  }

  async uploadCarById(id: string, worker: number = 3) {
    const [cars, { segmentMap, companyMap }, userMap, urlMap] = await Promise.all([
      this.getUserCars(id),
      this.categoryInitializer.initializeMaps(),
      this.getAccountMap(),
      this.getURLMap(),
    ])
    if (!cars.length) {
      console.log("Nothing to upload. end execution", id)
      return
    }

    const user = userMap.get(id)
    if (!user) throw new Error("No user");
    const urlObj = urlMap.get(user.region)
    if (!urlObj) throw new Error("No KCR URL");

    const carClassifier = new CarClassifier(cars, segmentMap, companyMap)
    const classifiedCars = carClassifier.classifyAll()

    const chunkedCars = chunk(classifiedCars, Math.ceil((classifiedCars.length / worker)))
    chunkedCars.forEach(chunk=>console.log(chunk.length))

    const rootDir = CarUploader.getImageRootDir(id)
    if(!existsSync(rootDir)) await mkdir(rootDir)

    await this.initializer.initializeBrowsers(chunkedCars.length)
    const pageList = this.initializer.pageList

    console.log("차량 업로드");
    try {
      const uploadResults: Promise<void>[] = []
      for (let i = 0; i < chunkedCars.length; i++) {
        const page = pageList[i]
        const chunkCars = chunkedCars[i]
        console.log(chunkCars);

        uploadResults.push(this.execute(page, user, urlObj, chunkCars))
      }
      await Promise.all(uploadResults)
    } catch(e) {
      throw e
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  }

}
