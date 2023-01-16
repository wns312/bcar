import * as puppeteer from "puppeteer"

// 네이밍 변경이 필요하다고 본다. Ex) BrowserController? BrowserManager?
export class BrowserInitializer {
  private _pageList: puppeteer.Page[] = []

  constructor(private nodeEnv: String){}

  get pageList() {
    return this._pageList
  }
  set pageList(pageList : puppeteer.Page[]) {
    this._pageList = pageList;
  }

  private createBrowser() {
    return puppeteer.launch({
      defaultViewport: null,
      args: ['--no-sandbox'],
      ignoreDefaultArgs: ['--disable-extensions'],
      headless: this.nodeEnv === 'prod',
      devtools: true,
    });
  }

  async initializeBrowsers(amount: number) {
    const promisePagesInitialize: Promise<puppeteer.Browser>[] = []
    for (let i = 0; i < amount; i++) {
      const browser = this.createBrowser()
      promisePagesInitialize.push(browser)

    }
    const initializedBrowsers = await Promise.all(promisePagesInitialize)
    const initializedPages = await Promise.all(
      initializedBrowsers.map(async browser=>{
        const pages = await browser.pages()
        return pages[0]
      })
    )
    this.pageList = this.pageList.concat(initializedPages)
  }

  async closePages() {
    const promiseClosedBrowsers = this.pageList.map(page => page.browser().close());
    await Promise.all(promiseClosedBrowsers)
    console.info(`Total ${promiseClosedBrowsers.length} browser(s) closed`);
  }

  async login(page: puppeteer.Page, url: string, id: string, pw: string) {
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

  async activateEvents(page: puppeteer.Page) {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => {
      console.error('Page error: ' + err.toString());
    });
    page.on('error', err => {
        console.error('Error: ' + err.toString());
    });
    page.on('requestfailed', request => {
        console.error(request.url() + ' ' + request.failure()!.errorText);
    });
  }
}
