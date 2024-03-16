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

export type CarCategory = Map<string, Company>

export interface CarBase {
  name: string
  dataValue: string
  index: number
}

export enum Origin {
  Domestic = "DOMESTIC",
  Imported = "IMPORTED",
}

export interface Company extends CarBase {
  origin: Origin
  carModelMap: Map<string, Model>
}

export interface Model extends CarBase {
  carSegment: string
  detailModels: DetailModel[] | null
}

export interface DetailModel extends CarBase {
}

export interface Segment {
  name: string
  value: string
  index: number
}

export interface UploadSource {
  car: Car
  origin: Origin
  segment: CarBase
  company: CarBase
  model?: CarBase
  detailModel?: CarBase
}

export interface Base64Image {
  base64: string
  ext: string
}

export interface SourceBundle {
  bongoPorterSources: UploadSource[]
  importedSources: UploadSource[]
  largeTruckSources: UploadSource[]
  domesticSourcesUnder1300: UploadSource[]
  domesticSourcesUnder2500: UploadSource[]
}
