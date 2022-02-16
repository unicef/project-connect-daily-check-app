import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular';
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  isLoading = false;
  loadingObj:any;
  constructor( public loadingController: LoadingController ) { }

  /**
   * Open loading 
   * @returns loader
   */
  async present(msg?: string, duration?: number, cssClass?: string, spinner?) {
    this.isLoading = true;
    this.loadingObj = {};

    if(spinner) {
      this.loadingObj.spinner = spinner;
    }

    if(msg){
      this.loadingObj.message = msg;
    }

    if(duration){
      this.loadingObj.duration = duration;
    }

    if(cssClass){
      this.loadingObj.cssClass = cssClass;
    }

    
    return await this.loadingController.create(this.loadingObj).then(a => {
      a.present().then(() => {
        if (!this.isLoading) {
          a.dismiss().then(() => console.log('abort presenting'));
        }
      });
    });
  }

  /**
   * Close the loader
   * @returns 
   */
  async dismiss() {
    this.isLoading = true;
    return await this.loadingController.dismiss().then(() => console.log('dismissed'));
  }
}
