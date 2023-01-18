import { Page } from "puppeteer";
import { CarListObject } from "../types"
import { delay, PageInitializer } from "../utils"

export class SourceCollector {
  constructor(
    private id: string,
    private pw: string,
    private loginUrl: string,
  ) {}

  private async login(page: Page) {
    await page.goto(this.loginUrl, { waitUntil: 'load' });
    await page.evaluate((id, pw) => {
      const elements = document.getElementsByClassName('iptD')
      const idInput = elements[0]
      const pwInput = elements[1]
      idInput.setAttribute('value', id)
      pwInput.setAttribute('value', pw)
    }, this.id, this.pw)
    await page.click('button[class="btn_login"]'),
    await page.waitForNavigation({waitUntil: 'networkidle2'})
  }

  private async waitForSearchList(page: Page) {
    let display = 'none'
    while (display === 'none') {
      display = await page.$eval('#searchList', ele => {
        return window.getComputedStyle(ele).getPropertyValue('display')
      })
    }
    await page.waitForSelector('#searchList');
  }

  private async selectCarsWithMaxPrice(page: Page, maxPrice: number) {
    await page.select('select[name="c_price2"]', `${maxPrice}`);
    await page.click('input[value="검색"]')
    await this.waitForSearchList(page)
  }

  private async collectPageAmount(page: Page) {
    const carAmount = await page.$eval('#sellOpenCarCount', (ele) => {
      if (typeof ele.textContent == 'string') {
        return ele.textContent
      }
      throw new Error(`text is not string: ${typeof ele.textContent}`)

    })
    console.log(carAmount);
    return Math.ceil( (parseInt(carAmount.replace(',', '')) / 100) ) + 1
  }

  private async getCarListObjectsWithPage(page: Page): Promise<CarListObject[]> {
    // Error: Node is either not clickable or not an HTMLElement
    const result = await page.$$eval('#searchList > table > tbody > tr', elements => {

      return elements.map(ele => {
        const td = ele.getElementsByTagName('td')
        if (td.length) {
          const title = td.item(2)!.querySelector('a > strong')!.textContent!.trim()
          const rawCompany = title!.split(' ')[0]
          const company = rawCompany != '제네시스' ? rawCompany : '현대'
          const rawCarNum =  td.item(0)!.textContent!
          const carNum = rawCarNum.split('\t').filter(str => ['\n', '', '광고중\n'].includes(str) ? false : true)[0]
          const detailPageNum = td.item(0)!.querySelector('span.checkbox > input')!.getAttribute('value')!
          const price = td.item(6)!.childNodes[0].textContent!.replace(',', '')
          return {
            title,
            company,
            carNum,
            detailPageNum: parseInt(detailPageNum),
            price: parseInt(price)
          }
        }
      }).filter((ele):ele is CarListObject=> Boolean(ele))

    })

    return result
  }

  private async movePage(page: Page, pageNum: number) {
    const aTag = await page.waitForSelector('#paging > a:nth-child(1)')
    if (!aTag) throw new Error("No Anchor tag")

    await aTag.evaluate((aTag, pageNum) => {
      aTag.setAttribute('href', `javascript:changePagenum(${pageNum});`)
    }, pageNum)
    await aTag.click()
    await this.waitForSearchList(page)
  }

  private async crawlCarList(page: Page) {
    await this.login(page)
    await this.selectCarsWithMaxPrice(page, 2000)
    const endPage = await this.collectPageAmount(page)
    console.log(endPage);

    let carObjs = [...await this.getCarListObjectsWithPage(page)]
    for (let i = 2; i < endPage; i++) {
      await this.movePage(page, i)
      console.log("Page: ", i);
      const datas = await this.getCarListObjectsWithPage(page)
      carObjs = [...carObjs, ...datas]
    }
    return carObjs
  }

  async crawlCar() {
    const page = await PageInitializer.createPage()
    try {
      const startTime = Date.now()
      const carObjects = await this.crawlCarList(page)
      const endTime = Date.now()
      console.log(endTime - startTime);
      return carObjects
    } catch (error) {
      console.error("Crawl list failed");
      throw error
    } finally {
      await page.browser().close()
    }
  }

  // 차량 디테일은 어떻게 긁어오지??
  // 그냥 일반 리스트를 저장한 뒤, 다시 긁어오도록 할까?
  // 아니면 굳이 변경하지 말까?
  // batch의 경우 브라우저를 여러개 띄울 수 있기 때문에
  // 더 적은 실행개수로도 많은 데이터를 끌어올 수 있다.
  // 하나의 batch당 1000개를 끌어오도록 하는것은 어떤가? (5개의 브라우저라면 200개씩만 끌어오면 된다.)
  // 그렇게 총 18개의 batch를 사용하는 것이다.
  // 굳이 그렇게 할 필요는 없어 보이는데.. 이미 람다는 무료로 잘 돌고있긴 하다.
  // 대신 batch로 언제든 돌릴 수 있도록 예비용으로만 만들어둘 것

  // 1. 차량 리스트를 긁어온 뒤, #CAR 접두어가 아닌 특정 접두어로 저장한다. (Ex. #TMP-차량번호)
  // 2. 디테일 collect 로직을 돌리는데, 브라우저 10대로 하나로 우선 시도해볼 것.
  // 3. 우선 시도해보고 안되면, batch container를 늘려서 1000대씩 가져오고, 선점 플래그를 true로 만들어서 다른 batch가 가져오지 않도록 할 것
  // 4. 완료된 TMP의 경우 선점한 container가 삭제하도록 한다?
}
