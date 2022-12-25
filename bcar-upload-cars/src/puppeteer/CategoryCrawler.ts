
import { Page } from "puppeteer"
import { BrowserInitializer } from "."
import { CarCategory, CarDetailModel, CarManufacturer, CarModel, CarSegment } from "../types"
import { delay } from "../utils"

// 교차로 로그인 인터페이스를 상속하는 방식으로 login 함수를 다룰 수 있도록 하는것이 바람직해 보임
export class CategoryCrawler {
  private segmentSelectorPrefix = "#post-form > table:nth-child(10) > tbody > tr:nth-child(1) > td > label"
  private segmentSelectorSuffix = " > input"
  private manufacturerSelector = "#categoryId > dl.ct_a > dd > ul > li"
  private modelSelector = "#categoryId > dl.ct_b > dd > ul > li"
  private detailModelSelector = "#categoryId > dl.ct_c > dd > ul > li"
  private _carSegmentMap = new Map<string, CarSegment>()
  private _carManufacturerMap: CarCategory = new Map<string, CarManufacturer>()

  constructor(private initializer: BrowserInitializer) {}

  get carSegmentMap() {
    return this._carSegmentMap
  }
  get carManufacturerMap() {
    return this._carManufacturerMap
  }
  private set carSegmentMap(carSegmentMap : Map<string, CarSegment>) {
    this._carSegmentMap = carSegmentMap;
  }
  private set carManufacturerMap(carManufacturerMap : Map<string, CarManufacturer>) {
    this._carManufacturerMap = carManufacturerMap;
  }

  private getTextContentAndDataValue(page: Page, selector: string) {
    return page.$eval(
      selector,
      element=> [element.textContent!, element.getAttribute('data-value')!]
    )
  }

  // Manufacturer Map 초기화
  private async createManufacturerMap(page: Page) {
    const textContentSelector = this.segmentSelectorPrefix + ":nth-child(1)"
    const clickselector = textContentSelector + this.segmentSelectorSuffix
    await page.click(clickselector)
    await page.waitForSelector("#categoryId > dl.ct_a > dd > ul > li")
    const manufacturers = await page.$$eval(this.manufacturerSelector, elements => {
      return elements.map(ele => [ele.textContent!, ele.getAttribute('data-value')!])
    })
    this.carManufacturerMap = manufacturers.reduce((map: CarCategory, ele: string[], index: number)=>{
      return map.set(ele[0], {
        name: ele[0],
        dataValue: ele[1],
        index: index + 1,
        carModelMap: new Map<string, CarModel>()
      })
    }, this.carManufacturerMap)
  }

  // Segment Map 초기화
  private async createCarSegmentMap(page: Page) {
    // ele.textContent!
    const segments = await page.$$eval(this.segmentSelectorPrefix, elements => elements.map(ele=>[ele.textContent!, ele.children.item(0)?.getAttribute("value")!]))
    for (let i = 0; i < segments.length -1 ; i++) {
      const seg = segments[i];
      this.carSegmentMap.set(seg[0]!, {
        name: seg[0]!,
        value: seg[1]!,
        index: i + 1
      })
    }
  }

  private async collectCarDetailModels(page: Page) {
    const carDetails = await page.$$eval(
      this.detailModelSelector,
      elements=> elements.map(ele => [ele.textContent!, ele.getAttribute('data-value')!])
    )
    // console.log(carDetails);

    return carDetails.map((carDetail, index): CarDetailModel => ({
        name: carDetail[0].split(' (')[0],
        dataValue: carDetail[1],
        index
      }))
  }

  private async collectCarModel(page: Page, carModelMap: Map<string,CarModel>, segment: string) {
    const modelLen = await page.$$eval(this.modelSelector, elements => elements.length)
    for (let i = 1; i <= modelLen - 1; i++) {
      const modelSelector = this.modelSelector + `:nth-child(${i})`
      await page.click(modelSelector)
      await delay(300)
      const [model, modelDataValue] = await this.getTextContentAndDataValue(page, modelSelector)
      carModelMap!.set(model!, {
        name: model!,
        dataValue: modelDataValue!,
        carSegment: segment,
        index: i,
        detailModels: await this.collectCarDetailModels(page)
      })
      console.log(carModelMap!.get(model!)!.name);
      console.log(carModelMap!.get(model!)!.detailModels);
    }
  }

  private async collectCarModelsBySegment(page: Page, segment: string, index: Number) {
    const textContentSelector = this.segmentSelectorPrefix + `:nth-child(${index})`
    const clickselector = textContentSelector + this.segmentSelectorSuffix
    await page.click(clickselector)
    await page.waitForSelector("#categoryId > dl.ct_a > dd > ul > li")

    const manufacturers = Array.from(this.carManufacturerMap.keys())

    // 차량 제조사 별 모델정보 collect
    for (let i = 0; i < this.carManufacturerMap.size; i++) {
      const carManufacturer = this.carManufacturerMap.get(manufacturers[i])

      if (manufacturers[i] == '기타') {
        continue
      }

      if (!carManufacturer) {
        throw new Error(`There is no proper manufacturer : ${manufacturers[i]}`)
      }

      const manufacturerSelector = this.manufacturerSelector + `:nth-child(${carManufacturer.index})`
      await page.click(manufacturerSelector)
      await delay(200)

      await this.collectCarModel(
        page,
        carManufacturer.carModelMap,
        segment
      )
    }
  }

  async execute(id: string, pw: string, loginUrl: string, registerUrl: string) {
    const url = loginUrl! + registerUrl!

    await this.initializer.initializeBrowsers(1)
    const [page] = await this.initializer.browserList[0].pages()

    await this.initializer.login(page, url, id, pw)
    await page.waitForSelector(
      "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"
    )

    await this.createCarSegmentMap(page)
    await this.createManufacturerMap(page)
    console.log(this.carSegmentMap);
    console.log(this.carManufacturerMap);

    await this.initializer.initializeBrowsers(this.carSegmentMap.size-1)

    // 각 브라우저 페이지 get
    const pagesList = await Promise.all(this.initializer.browserList.map(async browser => await browser.pages()))
    const pages = pagesList.map(pages=>pages[0])
    // 각 브라우저 로그인
    await Promise.all(
      pages.map(page => page.goto(url, { waitUntil: "networkidle2" }))
    )
    await Promise.all(
      pages.map(page => this.initializer.login(page, url, id, pw))
    )
    await Promise.all(
      pages.map(page => page.waitForSelector(
        "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"
      ))
    )
    // 각 브라우저가 정보를 가져올 수 있도록 execute
    const segmentKeys = Array.from(this.carSegmentMap.keys())
    const promiseExecutes: Promise<void>[] = []
    for (let i = 0; i < this.carSegmentMap.size; i++) {
      const carSegment = this.carSegmentMap.get(segmentKeys[i])
      if (!carSegment) {
        throw new Error(`There is no segment: ${segmentKeys[i]}`)
      }
      promiseExecutes.push(
        this.collectCarModelsBySegment(pages[i], carSegment!.name, carSegment!.index)
      )
    }
    await Promise.all(promiseExecutes)
    // console.log(this.carManufacturerMap);

    // 딜레이
    await delay(2000)
  }
}
