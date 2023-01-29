import { envs } from './configs'
import { Car } from './entities'

export type Environments = typeof envs

export type Incomplete<T> = {
  [P in keyof T]?: T[P] | undefined | null
}

export type RangeChunk = {
  start: number,
  end: number
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

export interface UploadSource {
  car: Car
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
