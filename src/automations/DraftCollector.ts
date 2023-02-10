import { Page } from "puppeteer"
import { DraftCar } from "../entities"
import { PageInitializer, rangeChunk } from "../utils"

export class DraftCollector {

  constructor(
    private id: string,
    private pw: string,
    private loginUrl: string,
    private manageUrl: string,
    private sourceSearchBase: string
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

  private async setPrice(page: Page, minPrice?: number, maxPrice?: number) {
    let url = `${this.manageUrl}?searchChecker=1&mode=&pageSize=100`
    if (minPrice) url += `&c_price1=${minPrice}`
    if (maxPrice) url += `&c_price2=${maxPrice}`
    await page.goto(url, {waitUntil: "networkidle2"})
    await this.waitForSearchList(page)
  }

  private async collectPageAmount() {
    const page = await PageInitializer.createPage()
    try {

      await PageInitializer.loginBCar(page, this.loginUrl, this.id, this.pw)
      await this.setPrice(page, 0, 2000)
      const rawCarAmount = await page.$eval('#sellOpenCarCount', (ele) => {
        if (!ele.textContent) throw new Error("text is Empty")
        return ele.textContent!
      })
      const carAmount = parseInt(rawCarAmount.replaceAll(",", ""))
      const pageAmount = Math.ceil(carAmount / 100) + 1
      console.log("Total page:", pageAmount, "/ Total car amount :", carAmount)

    return {
      carAmount,
      pageAmount,
    }
    } catch (error) {
      throw error
    } finally {
      await PageInitializer.closePage(page)
    }
  }

  private async collectRange(page: Page, startPage: number, endPage: number) {
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
      }, this.sourceSearchBase, pageNumber)
      rawDraftCars = [...rawDraftCars, ...rawDrafts.map(draft=>new DraftCar(draft))]
    }
    return rawDraftCars
  }


  async collectDraftCars() {
    const { pageAmount, carAmount } = await this.collectPageAmount()
    const ranges = rangeChunk(pageAmount, 40)

    try {
      const results = await Promise.all(
        ranges.map(async ({start, end})=> {
          const page = await PageInitializer.createPage()
          try {
            await PageInitializer.loginBCar(page, this.loginUrl, this.id, this.pw)
            const draftCarsChunk = await this.collectRange(page, start, end)
            return draftCarsChunk
          } catch (error) {
            throw error
          } finally {
            await PageInitializer.closePage(page)
          }
        })
      )
      const draftCars = results.flat()
      const setSize = new Set<string>(draftCars.map(car=>car.carNumber)).size
      if (setSize !== carAmount) {
        throw new Error(`Crawled amount is not correct: ${setSize} / ${carAmount}`)
      }
      console.log(`Total ${setSize} / ${carAmount} cars collected`)
      return draftCars
    } catch (error) {
      console.error("Crawl list failed")
      throw error
    }
  }

}
