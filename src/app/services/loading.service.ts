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
          // dismiss() ran while this loader was still opening.
          return a.dismiss().then(() => console.log('abort presenting'));
        }
      }).catch(() => undefined);
    });
  }

  /**
   * Close the loader. Safe to call when none is showing: two flows often both
   * close it, or close it before it has finished opening (present() then
   * closes it itself). Ionic rejects with "overlay does not exist" in those
   * cases, and none of the callers handle it.
   */
  async dismiss(): Promise<void> {
    this.isLoading = false;
    await this.loadingController
      .dismiss()
      .then(() => console.log('dismissed'))
      .catch(() => undefined);
  }

  /**
   * Check the current loading status
   * @returns boolean
   */
  isStillLoading(){
    return this.isLoading;
  }
}
