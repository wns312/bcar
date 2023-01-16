import { envs } from './configs'

export type Environments = typeof envs

export type RangeChunk = {
  start: number,
  end: number
}

export type Account = {
  id: string
  pw: string
  region: string
  isTestAccount: boolean
  isErrorOccured: boolean
  logStreamUrl: string | null
  errorContent: string | null
}
export type KCRURL = {
  region: string
  loginUrl: string
  registerUrl: string
  manageUrl: string
}

export type CarCategory = Map<string, CarManufacturer>

export interface CarBase {
  name: string
  dataValue: string
  index: number
}

export enum ManufacturerOrigin {
  Domestic = "DOMESTIC",
  Imported = "IMPORTED",
}

export interface CarManufacturer extends CarBase {
  origin: ManufacturerOrigin
  carModelMap: Map<string, CarModel>
}

export interface CarModel extends CarBase {
  carSegment: string
  detailModels: CarDetailModel[] | null
}

export interface CarDetailModel extends CarBase {
}

export interface CarSegment {
  name: string
  value: string
  index: number
}

export interface CarDataObject {
  PK: string
  SK: string
  carCheckSrc: string
  modelYear: string
  presentationsDate: string
  displacement: string
  mileage: string
  carImgList: string[]
  hasMortgage: boolean
  hasSeizure: boolean
  title: string
  fuelType: string
  carNumber: string
  registerNumber: string
  presentationNumber: string
  price: number
  hasAccident: string
  gearBox: string
  color: string
  company: string
  category: string
}

export interface UploadSource {
  car: CarDataObject
  origin: ManufacturerOrigin
  carSegment: CarBase
  carCompany?: CarBase
  carModel?: CarBase
  carDetailModel?: CarBase
}

export interface Base64Image {
  base64: string
  ext: string
}
