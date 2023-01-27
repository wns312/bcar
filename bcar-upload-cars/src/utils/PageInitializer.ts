import { Browser, launch, Page } from "puppeteer"
import { envs } from "../configs"

export class PageInitializer {
  static async createPages(amount: number) {
    if (!amount) return []
    const browsersPromises: Promise<Browser>[] = []

    for (let i = 0; i < amount; i++) {
      browsersPromises.push(
        launch({
          defaultViewport: null,
          args: ['--no-sandbox'],
          ignoreDefaultArgs: ['--disable-extensions'],
          headless: envs.NODE_ENV === 'prod',
          devtools: true,
        })
      )
    }

    return Promise.all(
      browsersPromises.map(async browserPromise=>{
        const browser = await browserPromise
        const pages = await browser.pages()
        return pages[0]
      })
    )
  }

  static async closePages(pages: Page[]) {
    await Promise.all(
      pages.map(page => page.browser().close())
    )
    console.info(`Total ${pages.length} browser(s) closed`);
  }

  static async createPage() {
    const pages = await this.createPages(1)
    return pages[0]
  }

  static closePage(page: Page) {
    return this.closePages([page])
  }

  static activateEvents(page: Page) {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()))
    page.on('pageerror', err => {
      console.error('Page error: ' + err.toString());
    })
    page.on('error', err => {
        console.error('Error: ' + err.toString());
    })
    page.on('requestfailed', request => {
        console.error(request.url() + ' ' + request.failure()!.errorText);
    })
  }

  static deActivateEvents(page: Page) {
    page.off('console', msg => console.log('PAGE LOG:', msg.text()))
    page.off('pageerror', err => {
      console.error('Page error: ' + err.toString());
    })
    page.off('error', err => {
        console.error('Error: ' + err.toString());
    })
    page.off('requestfailed', request => {
        console.error(request.url() + ' ' + request.failure()!.errorText);
    })
  }

  static async loginBCar(page: Page, url: string, id: string, pw: string) {
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate((id, pw) => {
      const elements = document.getElementsByClassName('iptD')
      const idInput = elements[0]
      const pwInput = elements[1]
      idInput.setAttribute('value', id)
      pwInput.setAttribute('value', pw)
    }, id, pw)
    await page.click('button[class="btn_login"]'),
    await page.waitForNavigation({waitUntil: 'networkidle2'})
  }

  static async loginKcr(page: Page, url: string, id: string, pw: string) {
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
}
