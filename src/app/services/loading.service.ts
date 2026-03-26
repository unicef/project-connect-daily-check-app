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

    return await this.loadingController.create(this.loadingObj).then(async a => {
      await a.present();
      if (!this.isLoading) {
        // dismiss was called before present completed — safely dismiss using getTop()
        const overlay = await this.loadingController.getTop();
        if (overlay) {
          await overlay.dismiss();
          console.log('abort presenting');
        }
      }
    });
  }

  /**
   * Close the loader
   * @returns 
   */
  async dismiss() {
    this.isLoading = false;
    try {
      const overlay = await this.loadingController.getTop();
      if (overlay) {
        await overlay.dismiss();
        console.log('dismissed');
      }
    } catch (e) {
      console.warn('LoadingService: no overlay to dismiss', e);
    }
  }

  /**
   * Check the current loading status
   * @returns boolean
   */
  isStillLoading(){
    return this.isLoading;
  }
}
