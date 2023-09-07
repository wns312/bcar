import * as cheerio from "cheerio"
import { Car, DraftCar } from "../entities"

export class DetailCollector {

  static detailBaseUrl = "http://thebestcar.kr/car/carView.html?m_no="
  static detailKeys = [
    '차종',        '배기량',
    '차량번호',    '연식',
    '주행거리',    '색상',
    '변속기',      '연료',
    '제시번호',    '사고유무',
    '등록번호',    '제시일',
    '압류 / 저당'
  ]

  static async requestHTML(url: string) {
    const myHeaders = new Headers()
    myHeaders.append('Content-Type','text/plain; charset=UTF-8')
    const response = await fetch(url, { headers: myHeaders })
    const buffer = await response.arrayBuffer()
    const decoder = new TextDecoder('euc-kr')
    return decoder.decode(buffer)
  }

  async checkDetailKey(draftCar: DraftCar) {
    // https://github.com/node-fetch/node-fetch/issues/568
    const url = DetailCollector.detailBaseUrl + draftCar.detailPageNum
    const text = await DetailCollector.requestHTML(url)

    const $ = cheerio.load(text)
    if (!$.html('body #detail_box').length) {
      console.error("This car is not available:", draftCar.carNumber, draftCar.detailPageNum)
      return
    }

    const tit = cheerio.parseHTML($.html('body #detail_box div.right div div.carContTop ul li span.tit'))
      .map(
        span=>Object.entries(span.children[0])
        .filter(([k, v])=> k === 'data')
        .map(([k, v])=> v.trim())
      ).flat() as string[]

      DetailCollector.detailKeys.forEach((key, i) => {
      if (key !== tit[i]) {
        console.error(tit)
        console.error(DetailCollector.detailKeys)
        throw Error("detail key info is not correct")
      }
    })
  }
// https://github.com/node-fetch/node-fetch/issues/568
  private async collect(draftCar: DraftCar) {
    const url = DetailCollector.detailBaseUrl + draftCar.detailPageNum
    const text = await DetailCollector.requestHTML(url)
    const $ = cheerio.load(text)

    if (!$.html('body #detail_box').length) {
      console.error("This car is not available:", draftCar.carNumber, draftCar.detailPageNum)
      return
    }
    // console.log(draftCar.carNumber, draftCar.detailPageNum)

    const [
      category, displacementStr,
      carNumber, modelYearStr,
      mileageStr, color,
      gearBox, fuelType,
      presentationNumber, hasAccident,
      registerNumber, presentationsDate,
      seizureAndMortgage
    ] = cheerio.parseHTML($.html('body #detail_box div.right div div.carContTop ul li span.txt'))
      .map(
        span=>Object.entries(span.children[0])
        .filter(([k, v])=> k === 'data')
        .map(([k, v])=> v.trim())
      )
      .flat() as string[]

    const modelYear = modelYearStr.trim().replace("년", "").replace("월", "").replace(" ", "-")
    const mileage = parseInt(mileageStr.replaceAll(",", "").replaceAll("Km", "").replaceAll("-", "0"))!
    const displacement = parseInt(displacementStr.replaceAll(",", "").replaceAll("cc", "").replaceAll("-", "0"))!
    const [hasSeizure, hasMortgage] = seizureAndMortgage.split(' / ').map(b=>b === '있음')

    const images = cheerio.parseHTML($.html('#detail_box div:nth-child(16) a img[src]'))
      .map(image=>Object.entries(image).filter(([k, v])=> k === 'attribs').map(([k, v])=> v))
      .flat()
      .map(attrs=>Object.entries(attrs).filter(([k, v])=> k === 'src').map(([k, v])=> v))
      .flat() as string[]

    const carCheckNumList = cheerio.parseHTML($.html('body #detail_box div:nth-child(21) iframe'))

    let carCheckSrc: string = ""
    if (carCheckNumList) {
      carCheckSrc = carCheckNumList
      .map(iframe=>Object.entries(iframe).filter(([k, v])=> k === 'attribs').map(([k, v])=> v))
      .flat()
      .map(attrs=>Object.entries(attrs).filter(([k, v])=> k === 'src').map(([k, v])=> v))
      .flat()[0] as string
    }

    return new Car({
      category,
      displacement,
      carNumber,
      modelYear,
      mileage,
      color,
      gearBox,
      fuelType,
      presentationNumber,
      hasAccident,
      registerNumber,
      presentationsDate,
      hasSeizure,
      hasMortgage,
      carCheckSrc,
      images,
      title: draftCar.title,
      price: draftCar.price,
      company: draftCar.company,
      isUploaded: false,
      uploader: "",
    })
  }

  async collectDetails(draftCars: DraftCar[]) {
    const results = await Promise.all(draftCars.map(draft=>this.collect(draft)))
    return results.filter((car): car is Car=>Boolean(car))
  }
}
