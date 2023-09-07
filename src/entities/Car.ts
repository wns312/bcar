interface ICar {
  carNumber: string
  title: string
  company: string
  price: number
  carCheckSrc: string
  modelYear: string
  presentationsDate: string
  displacement: number
  mileage: number
  hasMortgage: boolean
  hasSeizure: boolean
  fuelType: string
  registerNumber: string
  presentationNumber: string
  hasAccident: string
  gearBox: string
  color: string
  category: string
  images: string[]
  isUploaded: boolean
  uploader: string
}

export class Car {
  constructor(data: ICar){
    Object.assign(this, data)
  }

  carNumber!: string
  title!: string
  company!: string
  price!: number
  carCheckSrc!: string
  modelYear!: string
  presentationsDate!: string
  displacement!: number
  mileage!: number
  hasMortgage!: boolean
  hasSeizure!: boolean
  fuelType!: string
  registerNumber!: string
  presentationNumber!: string
  hasAccident!: string
  gearBox!: string
  color!: string
  category!: string
  images!: string[]
  isUploaded!: boolean
  uploader!: string
}
