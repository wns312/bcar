interface IRegionUrl {
  region: string
  baseUrl: string
}

export class RegionUrl {
  constructor(data: IRegionUrl){
    Object.assign(this, data)
  }

  region!: string
  baseUrl!: string

  get loginUrl() {
    return `https://ssl.${this.baseUrl}/membership/login?url=`
  }

  get registerUrl() {
    return `https://car.${this.baseUrl}/my/car_post/new?car_idx=&state=0`
  }

  get manageUrl() {
    return `https://car.${this.baseUrl}/my/car`
  }

  get loginUrlRedirectRegister() {
    return this.loginUrl + this.registerUrl
  }
  get loginUrlRedirectManage() {
    return this.loginUrl + this.manageUrl
  }
}
