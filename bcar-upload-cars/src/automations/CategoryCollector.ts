import { Page } from "puppeteer"
import { CarCategory, DetailModel, Company, Model, Segment, Origin } from "../types"
import { delay, PageInitializer } from "../utils"

// 교차로 로그인 인터페이스를 상속하는 방식으로 login 함수를 다룰 수 있도록 하는것이 바람직해 보임
// 또한 Nested Map 말고, 어차피 segment, model은 인자로 받아서 들어가므로, 각 map을 따로 만드는것이 좋아보임.. 아닌가?
export class CategoryCollector {
  private segmentSelectorPrefix = "#post-form > table:nth-child(10) > tbody > tr:nth-child(1) > td > label"
  private segmentSelectorSuffix = " > input"
  private manufacturerSelector = "#categoryId > dl.ct_a > dd > ul > li"
  private manufacturerOriginSelector = "#post-form > table:nth-child(10) > tbody > tr:nth-child(2) > td > p > label"
  private modelSelector = "#categoryId > dl.ct_b > dd > ul > li"
  private detailModelSelector = "#categoryId > dl.ct_c > dd > ul > li"
  private _carSegmentMap = new Map<string, Segment>()
  private _carManufacturerMap: CarCategory = new Map<string, Company>()

  get carSegmentMap() {
    return this._carSegmentMap
  }
  get carManufacturerMap() {
    return this._carManufacturerMap
  }
  private set carSegmentMap(carSegmentMap : Map<string, Segment>) {
    this._carSegmentMap = carSegmentMap;
  }
  private set carManufacturerMap(carManufacturerMap : Map<string, Company>) {
    this._carManufacturerMap = carManufacturerMap;
  }

  private getTextContentAndDataValue(page: Page, selector: string) {
    return page.$eval(
      selector,
      element=> [element.textContent!, element.getAttribute('data-value')!]
    )
  }

  // Manufacturer Map 초기화
  private async createDomesticManufacturerMap(page: Page) {
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
        origin: Origin.Domestic,
        carModelMap: new Map<string, Model>()
      })
    }, this.carManufacturerMap)
  }

  private async createImportedManufacturerMap(page: Page) {
    const manufacturerOriginSelector = this.manufacturerOriginSelector + ":nth-child(2)"
    await page.click(manufacturerOriginSelector)
    const textContentSelector = this.segmentSelectorPrefix + ":nth-child(2)"
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
        origin: Origin.Imported,
        carModelMap: new Map<string, Model>()
      })
    }, this.carManufacturerMap)
  }

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

    return carDetails.map((carDetail, index): DetailModel => ({
      name: carDetail[0].split(' (')[0],
      dataValue: carDetail[1],
      index
    }))
  }

  private async collectCarModel(page: Page, carModelMap: Map<string,Model>, segment: string) {
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

      if (manufacturers[i] == '기타') continue
      if (!carManufacturer) throw new Error(`There is no proper manufacturer : ${manufacturers[i]}`)

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
    const page = await PageInitializer.createPage()

    await PageInitializer.loginKcr(page, url, id, pw)
    await page.waitForSelector(
      "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"
    )

    await this.createCarSegmentMap(page)
    await this.createDomesticManufacturerMap(page)

    console.log(this.carSegmentMap);
    console.log(this.carManufacturerMap);
    const pages = [page, ...(await PageInitializer.createPages(this.carSegmentMap.size-1))]

    await Promise.all(
      pages.map(page => page.goto(url, { waitUntil: "networkidle2" }))
    )
    await Promise.all(
      pages.map(page => PageInitializer.loginKcr(page, url, id, pw))
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
    await this.createImportedManufacturerMap(page)
    // console.log(this.carManufacturerMap);
    await delay(2000)
    await PageInitializer.closePages(pages)
  }
}
