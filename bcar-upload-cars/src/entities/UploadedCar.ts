interface IUploadedCar {
  accountId: string
  carNumber: string
  isUploaded: boolean
}

export class UploadedCar implements IUploadedCar {
  constructor(data: IUploadedCar){
    Object.assign(this, data)
  }

  accountId!: string
  carNumber!: string
  isUploaded!: boolean
}
