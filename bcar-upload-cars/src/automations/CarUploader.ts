import { existsSync } from 'node:fs';
import { writeFile, mkdir, rm, readFile } from "fs/promises"
import { Page, ProtocolError } from "puppeteer"
import { Base64Image, ManufacturerOrigin, UploadSource } from "../types"
import { Car } from '../entities';

export class CarUploaderSelector {
  private constructor() { }

  static formBase = "#post-form > table:nth-child(10) > tbody > tr"
  // static registerPageWaitSelector = "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"

  // Car Categorize related
  static originSelectorBase =  CarUploaderSelector.formBase + ":nth-child(2) > td > p > label"
  static domesticSelector = CarUploaderSelector.originSelectorBase + ":nth-child(1)"
  static importedSelector = CarUploaderSelector.originSelectorBase + ":nth-child(2)"

  static segmentBase =  CarUploaderSelector.formBase + ":nth-child(1) > td > label"
  static segmentSmallSelector = CarUploaderSelector.segmentBase + ":nth-child(1)"
  static segmentMediumSelector = CarUploaderSelector.segmentBase + ":nth-child(2)"
  static segmentLargeSelector = CarUploaderSelector.segmentBase + ":nth-child(3)"
  static segmentSportCarSelector = CarUploaderSelector.segmentBase + ":nth-child(4)"
  static segmentRecreationalSelector = CarUploaderSelector.segmentBase + ":nth-child(5)"
  static segmentVanSelector = CarUploaderSelector.segmentBase + ":nth-child(6)"
  static segmentBusAndTruckSelector = CarUploaderSelector.segmentBase + ":nth-child(7)"

  static companyBase = "#categoryId > dl.ct_a > dd > ul > li"
  static companyDataValueBase = CarUploaderSelector.companyBase + ".cateid-"

  static modelBase = "#categoryId > dl.ct_b > dd > ul > li"
  static modelDataValueBase = CarUploaderSelector.modelBase + ".cateid-"

  static detailModelBase = "#categoryId > dl.ct_c > dd > ul > li"
  static detailModelDataValueBase = CarUploaderSelector.detailModelBase + ".cateid-"

  static modelNameInputSelector = "#model-name-display > input"

  // Car Information related
  static carNumberInputSelector =  CarUploaderSelector.formBase + ":nth-child(7) > td > input"

  static modelYearSelector =  CarUploaderSelector.formBase + ":nth-child(8) > td > select.cof-select.cof-select-year.cof-form.cof-select-done"
  static modelMonthSelector =  CarUploaderSelector.formBase + ":nth-child(8) > td > select.cof-select.cof-select-month.cof-form.cof-select-done"

  static mileageInputSelector =  CarUploaderSelector.formBase + ":nth-child(9) > td > input"
  static displacementInputSelector =  CarUploaderSelector.formBase + ":nth-child(11) > td > input"
  static fuelTypeSelector = CarUploaderSelector.formBase + ":nth-child(13) > td > select"
  static priceInputSelector =  CarUploaderSelector.formBase + ":nth-child(19) > td > input"

  // gearBox
  static gearboxAutoSelector = CarUploaderSelector.formBase + ":nth-child(10) > td > label:nth-child(1)"
  static gearboxManualSelector = CarUploaderSelector.formBase + ":nth-child(10) > td > label:nth-child(2)"
  static gearboxCvtSelector = CarUploaderSelector.formBase + ":nth-child(10) > td > label:nth-child(3)"
  static gearboxSemiAutoSelector = CarUploaderSelector.formBase + ":nth-child(10) > td > label:nth-child(4)"

  // hasAccident
  static hasAccidentTrueSelector = CarUploaderSelector.formBase + ":nth-child(16) > td > label:nth-child(1)"
  static hasAccidentFalseSelector = CarUploaderSelector.formBase + ":nth-child(16) > td > label:nth-child(2)"
  static hasAccidentTextareaSelector = "#accident-display > textarea"
  // Seizure Mortgage
  static seizureMortgageBase = "#post-form > table:nth-child(15) > tbody > tr"
  static hasSeizureFalseSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(1) > td > label:nth-child(1)"
  static hasSeizureTrueSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(1) > td > label:nth-child(2)"
  static hasMortgageFalseSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(2) > td > label:nth-child(1)"
  static hasMortgageTrueSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(2) > td > label:nth-child(2)"
  // static hasSeizureNullSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(1) > td > label:nth-child(3)"
  // static hasMortgageNullSelector = CarUploaderSelector.seizureMortgageBase + ":nth-child(2) > td > label:nth-child(3)"

  // color
  static colorSelectSelector = "#carColorItem_title"
  static colorItemSelectSelector = "#carColorItem_child > ul"
  static colorChildBaseSelector = "#carColorItem_child > ul > li"
  static colorChoiceSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(1)" // 선택
  static colorBlackSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(2)" // 검정
  static colorRatSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(3)" // 쥐
  static colorSilverSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(4)" // 은
  static colorSilverGreySelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(5)" // 은회
  static colorWhiteSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(6)" // 흰
  static colorPearlSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(7)" // 진주
  static colorGalaxySelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(8)" // 은하
  // CarUploaderSelector.colorChildBaseSelector + ":nth-child(9)" // 명은
  // CarUploaderSelector.colorChildBaseSelector + ":nth-child(10)" // 갈대
  // CarUploaderSelector.colorChildBaseSelector + ":nth-child(11)" // 연금
  static colorBrownSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(12)" // 갈
  static colorGoldSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(13)" // 금
  static colorBlueSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(14)" // 청
  static colorSkySelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(15)" // 하늘
  // CarUploaderSelector.colorChildBaseSelector + ":nth-child(16)" // 담녹
  static colorGreenSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(17)" // 녹
  static colorPeaGreenSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(18)" // 연두
  static colorEmeraldSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(19)" // 청옥
  static colorRedSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(20)" // 빨간
  static colorOrangeSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(21)" // 주황
  // static colorPurpleSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(22)" // 자주
  static colorVioletSelector =  CarUploaderSelector.colorChildBaseSelector + ":nth-child(23)" // 보라
  static colorPinkSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(24)" // 분홍
  static colorYellowSelector = CarUploaderSelector.colorChildBaseSelector + ":nth-child(25)" // 노랑
  static colorEtcSelector =  CarUploaderSelector.colorChildBaseSelector + ":nth-child(26)" // 기타
  static colorEtcInputSelector = "#color-etc-display > input"

  // file
  static fileChooserSelector = "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"
  static imageRegisterButtonSelector = "#post-form > div:nth-child(21) > div.photo_view.clearfix > div > span.custom-button-box > label:nth-child(1)"
  static fileUploadedPreviewSelector = "#post-form > div:nth-child(19) > div.photo_view.clearfix > div > ul > li:nth-child(1) > img"
  // sumbmit input
  static submitInputSelector = "#post-form > div.submit_area > input.cof-btn.cof-btn-large.btn_add"

  static getOriginSelector(origin: ManufacturerOrigin) {
    return origin === ManufacturerOrigin.Domestic ? CarUploaderSelector.domesticSelector : CarUploaderSelector.importedSelector
  }

  static getSegmentSelector(segmentName: string) {
    switch (segmentName) {
      case "경소형":
        return CarUploaderSelector.segmentSmallSelector
      case "준중형":
        return CarUploaderSelector.segmentMediumSelector
      case "중대형":
        return CarUploaderSelector.segmentLargeSelector
      case "스포츠카":
        return CarUploaderSelector.segmentSportCarSelector
      case "SUV/RV":
        return CarUploaderSelector.segmentRecreationalSelector
      case "승합":
        return CarUploaderSelector.segmentVanSelector
      case "화물/버스":
        return CarUploaderSelector.segmentBusAndTruckSelector
      default:
        throw new Error("No proper segment");
    }
  }

  static getYearMonthFromString(yearMonth: string) {
    const [year, month] = yearMonth.split("-")
    return { year, month }
  }

  static getFuelType(fuelType: string) {
    switch (fuelType) {
      case "휘발유":
        return "gasoline";
      case "경유":
        return "diesel";
      case "LPG":
        return "lpg";
      case "전기":
        return "electric";
      case "수소":
        return "hydrogen";
      case "CNG":
        return "cng";
      case "하이브리드":
      case "겸용":
        return "hybrid_gasoline";
      default:
        return "gasoline";
        // throw new Error("No proper fuel type")
    }
  }

  static getGearType(gearType: string) {
    switch (gearType) {
      case "오토":
      return CarUploaderSelector.gearboxAutoSelector
      case "수동":
      return CarUploaderSelector.gearboxManualSelector
      case "CVT":
      return CarUploaderSelector.gearboxCvtSelector
      case "오토":
      return CarUploaderSelector.gearboxSemiAutoSelector
      default:
        return CarUploaderSelector.gearboxAutoSelector
        // throw new Error("No proper gear type")
    }
  }

  static getHasAccident(hasAccident: string) {
    switch (hasAccident) {
      case "무사고":
      case "-":
      return CarUploaderSelector.hasAccidentFalseSelector
      case "유사고":
      return CarUploaderSelector.hasAccidentTrueSelector
      default:
        throw new Error("No proper accident type")
    }
  }

  static getColor(color: string) {
    switch (color) {
      case "검정색":
      case "검정":
      case "검정투톤":
        return CarUploaderSelector.colorBlackSelector
      case "흰색":
      case "흰색투톤":
        return CarUploaderSelector.colorWhiteSelector
      case "진주색":
      case "진주투톤":
      case "베이지":
        return CarUploaderSelector.colorPearlSelector
      case "쥐색":
        return CarUploaderSelector.colorRatSelector
      case "은하색":
        return CarUploaderSelector.colorGalaxySelector
      case "은색":
      case "은색투톤":
      case "은회색":
        return CarUploaderSelector.colorSilverSelector
      case "회색":
      case "회색투톤":
      case "진회색":
      case "검정쥐색":
        return CarUploaderSelector.colorSilverGreySelector
      case "파랑(남색,곤색)":
      case "청색":
      case "남색":
      case "군청색":
      case "청색투톤":
      case "진청색":
        return CarUploaderSelector.colorBlueSelector
      case "하늘색":
        return CarUploaderSelector.colorSkySelector
      case "녹색":
      case "녹색투톤":
      case "담녹색":
      case "초록(연두)":
        return CarUploaderSelector.colorGreenSelector
      case "연두색":
        return CarUploaderSelector.colorPeaGreenSelector
      case "청옥색":
        return CarUploaderSelector.colorEmeraldSelector
      case "빨강색":
      case "빨강(주홍)":
      case "빨강투톤":
      case "흑장미색":
        return CarUploaderSelector.colorRedSelector
      case "분홍색":
        return CarUploaderSelector.colorPinkSelector
      case "주황색":
        return CarUploaderSelector.colorOrangeSelector
      case "노랑":
      case "노란색":
      case "겨자색":
        return CarUploaderSelector.colorYellowSelector
      case "금색":
        return CarUploaderSelector.colorGoldSelector
      case "밤색":
      case "갈색":
      case "갈대색":
      case "갈색(밤색)":
        return CarUploaderSelector.colorBrownSelector
      case "자주색":
      case "자주(보라)":
        return CarUploaderSelector.colorVioletSelector
      case "":
        return CarUploaderSelector.colorEtcSelector
      default:
        return CarUploaderSelector.colorEtcSelector
    }
  }
}


export class CarUploader {
  succeededSources: UploadSource[] = []
  failedSources: UploadSource[] = []

  constructor(
    private page: Page,
    private id: string,
    private registerUrl: string,
    private sources: UploadSource[]
    ) {}

  static getImageRootDir(id: string) {
    return `./images/${id}`
  }

  static getImageDir(id: string, carNumber: string) {
    return CarUploader.getImageRootDir(id) +`/${carNumber}`
  }

  static getImagePath(id: string, carNumber: string, imageName: string) {
    return CarUploader.getImageDir(id, carNumber) + imageName
  }

  // 아래와 같은 파일명 처리해주어야 함
  // https://file.kcrwork.com/car/t/2023/0108/63ba17b93f491.63ba17b93f497.jpg net::ERR_ABORTED
  // url.split("_") 부분
  static async saveImage(imageDir: string, url: string): Promise<Base64Image> {
    const response = await fetch(url)
    if (response.status !== 200) {
      console.error(response);
      throw new Error("Error response");
    }
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileNameList = url.split("_")
    const actualFileName = fileNameList[fileNameList.length-1]
    const ext = actualFileName.split(".").pop()
    const fileDir = `${imageDir}/${actualFileName}`
    await writeFile(fileDir, buffer)
    const base64 = await readFile(fileDir, {encoding: "base64"})
    return {
      base64,
      ext: ext!,
    }
  }

  async saveImages(imageDir: string, carImgList: string[]) {
    return carImgList.length ? Promise.all(carImgList.map(url=>CarUploader.saveImage(imageDir, url))) : []
  }



  async uploadImages(base64ImgList: Base64Image[]) {
    await this.page.evaluate(async (base64ImgList)=>{
      const dataTranster = base64ImgList.reduce(
        (dataTranster, {base64, ext}, index)=>{
        const bstr = atob(base64)
        const u8arr = new Uint8Array(bstr.length).map((_, i)=>bstr.charCodeAt(i))
        dataTranster.items.add(new File([u8arr], `${index}.${ext}`, {type:`image/${ext}`}))
        return dataTranster
        },
        new DataTransfer()
      )
      const fileInput = document.getElementById("file_image") as HTMLInputElement | null
      fileInput!.files = dataTranster.files;
      fileInput!.dispatchEvent(new Event('change', { bubbles: true })); // 유사하게 input 이벤트도 있음
    }, base64ImgList)

    await this.page.waitForSelector(CarUploaderSelector.fileUploadedPreviewSelector)
  }

  async inputCarInformation(car: Car) {
    // modelYear: 연식
    const { year, month } = CarUploaderSelector.getYearMonthFromString(car.modelYear)
    await this.page.select(CarUploaderSelector.modelYearSelector, year)
    await this.page.select(CarUploaderSelector.modelMonthSelector, month)
    // fuelType: 연료종류
    const fuelOption = CarUploaderSelector.getFuelType(car.fuelType)
    await this.page.select(CarUploaderSelector.fuelTypeSelector, fuelOption)
    // gearType: 변속기
    const gearRadioInput = CarUploaderSelector.getGearType(car.gearBox)
    await this.page.click(gearRadioInput)

    // 압류: hasSeizure, 저당: hasMortgage
    const hasSeizureSelector = car.hasSeizure ? CarUploaderSelector.hasSeizureTrueSelector : CarUploaderSelector.hasSeizureFalseSelector
    const hasMortgageSelector = car.hasMortgage ? CarUploaderSelector.hasMortgageTrueSelector : CarUploaderSelector.hasMortgageFalseSelector
    await this.page.click(hasSeizureSelector)
    await this.page.click(hasMortgageSelector)

    // hasAccident: 사고여부
    const hasAccicentInput = CarUploaderSelector.getHasAccident(car.hasAccident)
    await this.page.click(hasAccicentInput)
    if (hasAccicentInput === CarUploaderSelector.hasAccidentTrueSelector) {
      const accidentTextArea = await this.page.waitForSelector(CarUploaderSelector.hasAccidentTextareaSelector)
      await accidentTextArea!.type("-")
    }

    // 색상: color
    const color = CarUploaderSelector.getColor(car.color)
    await this.page.click(CarUploaderSelector.colorSelectSelector)
    await this.page.waitForSelector(CarUploaderSelector.colorItemSelectSelector)
    await this.page.click(color)
    if (color === CarUploaderSelector.colorEtcSelector) {
      const carColorInput = await this.page.waitForSelector(CarUploaderSelector.colorEtcInputSelector)
      await carColorInput!.type("-")
    }

    // carNumber: 차량번호 / mileage: 주행거리 / displacement: 배기량 / price: 가격
    const additionalPrice = 40
    const evaluateInputList = [
      {
        selector: CarUploaderSelector.carNumberInputSelector,
        value: car.carNumber,
      },
      {
        selector: CarUploaderSelector.mileageInputSelector,
        value: car.mileage,
      },
      {
        selector: CarUploaderSelector.displacementInputSelector,
        value: car.displacement,
      },
      {
        selector: CarUploaderSelector.priceInputSelector,
        value: (car.price + additionalPrice).toString(),
      }
    ]

    await this.page.evaluate(list=>{
      list.forEach(({ selector, value })=>{
        const input = document.querySelector(selector)
        if (!input) {
          throw new Error("No proper selector")
        }
        input.setAttribute('value', value.toString())
      })
    }, evaluateInputList)
  }

  async categorizeCar(source: UploadSource) {
    const { origin, carSegment, carCompany, carModel, carDetailModel, car } = source
    const originSelector = CarUploaderSelector.getOriginSelector(origin)
    const segmentSelector = CarUploaderSelector.getSegmentSelector(carSegment.name)
    const companySelector = CarUploaderSelector.companyDataValueBase + carCompany!.dataValue

    await this.page.click(originSelector)
    await this.page.click(segmentSelector)

    if (carCompany && carCompany.name === "기타") {
      await this.page.waitForSelector(CarUploaderSelector.companyBase)
      const companyLiList = await this.page.$$(CarUploaderSelector.companyBase)
      const companyEtcLi = companyLiList[companyLiList.length-1]
      await companyEtcLi.click()
    } else {
      await this.page.waitForSelector(companySelector)
      await this.page.click(companySelector)
    }

    if (!carModel) {
      if (origin === ManufacturerOrigin.Domestic) {
        await this.page.waitForSelector(CarUploaderSelector.modelBase)
        const liList = await this.page.$$(CarUploaderSelector.modelBase)
        const etcLi = liList[liList.length-1]
        await etcLi.click()
      }
      const carTitleInput = await this.page.waitForSelector(CarUploaderSelector.modelNameInputSelector)
      if (carTitleInput) {
        await carTitleInput.type(car.title)
      }
      return
    }

    const modelSelector = CarUploaderSelector.modelDataValueBase + carModel?.dataValue
    await this.page.waitForSelector(modelSelector)
    await this.page.click(modelSelector)

    if (!carDetailModel) {
      const carTitleInput = await this.page.waitForSelector(CarUploaderSelector.modelNameInputSelector)
      if (carTitleInput) {
        await carTitleInput.type(car.title)
      }
      return
    }

    const detailModelSelector = CarUploaderSelector.detailModelDataValueBase + carDetailModel.dataValue
    await this.page.waitForSelector(detailModelSelector)
    await this.page.click(detailModelSelector)
  }

  async uploadCar(source: UploadSource) {
    const imageDir = CarUploader.getImageDir(this.id, source.car.carNumber)

    await this.page.goto(this.registerUrl, { waitUntil: "networkidle2"})
    await this.page.waitForSelector(CarUploaderSelector.formBase)
    const base64ImageList = await this.saveImages(imageDir, source.car.images)

    await this.inputCarInformation(source.car)  // form 채우기
    // 차량 카테고리 설정
    await this.categorizeCar(source)
    await this.page.focus(CarUploaderSelector.imageRegisterButtonSelector)
    await this.uploadImages(base64ImageList)
    await this.page.click(CarUploaderSelector.submitInputSelector)
    await this.page.waitForNavigation() // {waitUntil: "load"}
  }

  async uploadCars() {
    for (const source of this.sources) {
      const imageDir = CarUploader.getImageDir(this.id, source.car.carNumber)
      if(!existsSync(imageDir)) {
        await mkdir(imageDir)
      }
      try {
        await this.uploadCar(source)
        this.succeededSources.push(source)
      } catch (error) {
        this.failedSources.push(source)
        // 처리해야하는 에러. 종료되어야 한다. 또는 재시작 되어야 함
        // 에러 메시지: net::ERR_INTERNET_DISCONNECTED at https://car.ansankcr.co.kr/my/car_post/new?car_idx=&state=0
        // 에러 메시지: net::ERR_CONNECTION_TIMED_OUT
        if (error instanceof ProtocolError || !(error instanceof Error)) {
          console.log("Unexpected error: stop execution");
          return
        }
        console.error("차량 등록에 실패했습니다.")
        console.error(source.car.carNumber)
        console.error(source.origin)
        console.error(source.carSegment)
        console.error(source.carCompany)
        console.error(error.name)
        console.error(error.stack)

      } finally {
        if(existsSync(imageDir)) {
          await rm(imageDir, { recursive: true, force: true })
        }
      }
    }
  }
}
