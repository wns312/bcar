import { existsSync } from 'node:fs';
import { mkdir, rm } from "fs/promises"
import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { Page } from "puppeteer"
import { CarUploader } from "../automations"
import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, RegionUrl } from "../entities"
import { UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk, PageInitializer } from "../utils"
import { Car } from '../entities';

export class CarUploadService {

  _accountMap?: Map<string, Account>
  _regionUrlMap?: Map<string, RegionUrl>

  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}

  async login(page: Page, url: string, id: string, pw: string) {
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.evaluate((id, pw) => {
      const idInput = document.querySelector('#content > form > fieldset > div.form_inputbox > div:nth-child(1) > input')
      const pwInput = document.querySelector('#content > form > fieldset > div.form_inputbox > div:nth-child(3) > input')
      if (idInput && pwInput) {
        idInput.setAttribute('value', id)
        pwInput.setAttribute('value', pw)
      } else {
        throw new Error("Cannot find id, pw input")
      }
    }, id, pw)

    await page.click("#content > form > fieldset > span > input")

    await page.waitForNavigation({waitUntil: 'networkidle2'})
  }

  private async getUserCars(id: string): Promise<Car[]> {
    const unUploadedCars = await this.dynamoUploadedCarClient.queryByIdAndIsUploaded(id, false)
    if (!unUploadedCars.length) {
      return []
    }
    const cars = await this.dynamoCarClient.QueryCarsByCarNumbers(unUploadedCars.map(car=>car.carNumber))
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
    if (!this._regionUrlMap) {
      const allUrls = await this.sheetClient.getRegionUrls()
      this._regionUrlMap = new Map<string, RegionUrl>(allUrls.map(urlObj=>[urlObj.region, urlObj]))
    }
    return this._regionUrlMap!
  }

  private async execute(
    page: Page, {id, pw}: Account, { loginUrl, registerUrl }: RegionUrl, chunkCars: UploadSource[]
  ) {
    await this.login(page, loginUrl + registerUrl, id, pw)

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
    const pages = await PageInitializer.createPages(chunkedCars.length)
    console.log("차량 업로드")

    try {
      const uploadResults: Promise<void>[] = []
      for (let i = 0; i < chunkedCars.length; i++) {
        const page = pages[i]
        const chunkCars = chunkedCars[i]

        uploadResults.push(this.execute(page, user, urlObj, chunkCars))
      }
      await Promise.all(uploadResults)
    } catch(e) {
      throw e
    } finally {
      await PageInitializer.closePages(pages)
      await rm(rootDir, { recursive: true, force: true })
    }
  }

}
