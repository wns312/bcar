import { Page } from "puppeteer"
import { DraftCar } from "../entities"
import { RangeChunk } from "../types"
import { PageInitializer, rangeChunk } from "../utils"

export class DraftCollector {

  constructor(
    private id: string,
    private pw: string,
    private loginUrl: string,
    private manageUrl: string,
    private sourceSearchBase: string,
    private sourceSearchTruckBase: string,
    private sourceSearchBusBase: string,
  ) {}

  private async waitForSearchList(page: Page) {
    let display = 'none'
    while (display === 'none') {
      display = await page.$eval('#searchList', ele => {
        return window.getComputedStyle(ele).getPropertyValue('display')
      })
    }
    await page.waitForSelector('#searchList');
  }

  private async setTruckPrice(page: Page, minPrice?: number, maxPrice?: number) {
    let url = `${this.manageUrl}?searchChecker=1&mode=&pageSize=100&c_cho=3`
    if (minPrice) url += `&c_price1=${minPrice}`
    if (maxPrice) url += `&c_price2=${maxPrice}`
    await page.goto(url, {waitUntil: "networkidle2"})
    await this.waitForSearchList(page)
  }

  private async setBusPrice(page: Page, minPrice?: number, maxPrice?: number) {
    let url = `${this.manageUrl}?searchChecker=1&mode=&pageSize=100&c_cho=4`
    if (minPrice) url += `&c_price1=${minPrice}`
    if (maxPrice) url += `&c_price2=${maxPrice}`
    await page.goto(url, {waitUntil: "networkidle2"})
    await this.waitForSearchList(page)
  }

  private async setPrice(page: Page, minPrice?: number, maxPrice?: number) {
    let url = `${this.manageUrl}?searchChecker=1&mode=&pageSize=100&c_cho=0`
    if (minPrice) url += `&c_price1=${minPrice}`
    if (maxPrice) url += `&c_price2=${maxPrice}`
    await page.goto(url, {waitUntil: "networkidle2"})
    await this.waitForSearchList(page)
  }

  // 여기서 화물과 버스 page도 가져올 것
  private async collectPageAmount() {
    const page = await PageInitializer.createPage()
    try {

      await PageInitializer.loginBCar(page, this.loginUrl, this.id, this.pw)
      await this.setPrice(page, 100, 2500)
      const rawCarAmount = await page.$eval('#sellOpenCarCount', (ele) => {
        if (!ele.textContent) throw new Error("text is Empty")
        return ele.textContent!
      })
      await this.setTruckPrice(page, 100, 4000)
      const rawTruckAmount = await page.$eval('#sellOpenCarCount', (ele) => {
        if (!ele.textContent) throw new Error("text is Empty")
        return ele.textContent!
      })
      await this.setBusPrice(page, 100, 4000)
      const rawBusAmount = await page.$eval('#sellOpenCarCount', (ele) => {
        if (!ele.textContent) throw new Error("text is Empty")
        return ele.textContent!
      })
      const carAmount = parseInt(rawCarAmount.replaceAll(",", ""))
      const truckAmount = parseInt(rawTruckAmount.replaceAll(",", ""))
      const busAmount = parseInt(rawBusAmount.replaceAll(",", ""))

      const carPageAmount = Math.ceil(carAmount / 100) + 1
      const truckPageAmount = Math.ceil(truckAmount / 100) + 1
      const busPageAmount = Math.ceil(busAmount / 100) + 1
      console.log(
        "Total page:", carPageAmount,
        "/ Total car amount :", carAmount,
        "/ Total truck amount :", truckAmount,
        "/ Total bus amount :", busAmount,
      )

    return {
      carAmount,
      truckAmount,
      busAmount,
      carPageAmount,
      truckPageAmount,
      busPageAmount,
    }
    } catch (error) {
      throw error
    } finally {
      await PageInitializer.closePage(page)
    }
  }

  private async collectRange(page: Page, sourceSearchBase: string, startPage: number, endPage: number): Promise<DraftCar[]> {
    let rawDraftCars: DraftCar[] = []
    for (let pageNumber = startPage; pageNumber < endPage; pageNumber++) {
      console.log(`Page : ${pageNumber} / ${endPage} (${rawDraftCars.length})`)

      const rawDrafts = await page.evaluate(async (sourceSearchBase, pageNumber)=>{
        const decoder = new TextDecoder('euc-kr')
        const headers = new Headers()
        headers.append('Content-Type','text/plain; charset=UTF-8')
        const response = await fetch(sourceSearchBase + pageNumber, { headers })
        const buffer = await response.arrayBuffer()
        const myDiv = document.createElement('div')
        myDiv.innerHTML = decoder.decode(buffer)

        const trTags = myDiv.querySelectorAll("table > tbody > tr")
        return Array.from(trTags)
          .filter(tr=>tr.querySelectorAll("td").length)
          .map(tr=>{
          const td = tr.querySelectorAll("td")
          const title = td[2].querySelector('a > strong')!.textContent!.trim()
          const rawCompany = title.split(' ')[0]
          const company = rawCompany !== '제네시스' ? rawCompany : '현대'
          const carNumber = td[0].textContent!.split('\t').filter(str => ['\n', '', '광고중\n'].includes(str) ? false : true)[0]
          const detailPageNum = td[0].querySelector('span.checkbox > input')!.getAttribute('value')!
          const price = td[6].childNodes[0].textContent!.replace(',', '')
          return {
              title,
              company,
              carNumber,
              detailPageNum: detailPageNum,
              price: parseInt(price),
          }
        })
      }, sourceSearchBase, pageNumber)
      rawDraftCars = [...rawDraftCars, ...rawDrafts.map(draft=>new DraftCar(draft))]
    }
    return rawDraftCars
  }

  async collect(ranges: RangeChunk[], searchBase: string) {
    const promises = ranges.map(async ({start, end})=> {
      const page = await PageInitializer.createPage()
      try {
        await PageInitializer.loginBCar(page, this.loginUrl, this.id, this.pw)
        const collectedCars = await this.collectRange(page, searchBase, start, end)
        return collectedCars
      } catch (error) {
        throw error
      } finally {
        await PageInitializer.closePage(page)
      }
    })
    const nestedDrafts = await Promise.all(promises)
    return nestedDrafts.flat()
  }


  async collectDraftCars() {
    const {
      carAmount,
      truckAmount,
      busAmount,
      carPageAmount,
      truckPageAmount,
      busPageAmount
    } = await this.collectPageAmount()
    console.log("carAmount, truckAmount, busAmount: ", carAmount, truckAmount, busAmount)

    const ranges = rangeChunk(carPageAmount, 55)
    const truckRanges = rangeChunk(truckPageAmount, 10)
    const busRanges = rangeChunk(busPageAmount, 40)

    try {
      const [draftTrucks, draftBuses] = await Promise.all([
        this.collect(truckRanges, this.sourceSearchTruckBase),
        this.collect(busRanges, this.sourceSearchBusBase)
      ])
      const draftCars = await this.collect(ranges, this.sourceSearchBase)
      const draftCarMap = new Map<string, DraftCar>(draftCars.map(car=>[car.carNumber, car]))
      draftTrucks
        .concat(draftBuses)
        .forEach(car => {
          draftCarMap.set(car.carNumber, car)
        })
      return Array.from(draftCarMap.values())
    } catch (error) {
      console.error("Crawl list failed")
      throw error
    }
  }

}
