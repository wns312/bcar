interface IDraftCar {
  carNumber: string
  title: string
  company: string
  detailPageNum: string
  price: number
}

export class DraftCar implements IDraftCar {
  constructor(data: IDraftCar){
    Object.assign(this, data)
  }

  carNumber!: string
  title!: string
  company!: string
  detailPageNum!: string
  price!: number
}
