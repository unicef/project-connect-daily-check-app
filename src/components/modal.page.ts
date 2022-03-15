
  import { Component, Input } from '@angular/core';
  import { ModalController } from '@ionic/angular';

@Component({
  selector: 'modal-page',
  templateUrl: 'modal.page.html',
  styleUrls: ['modal.page.scss'],
})

export class ModalPage {
    @Input() firstName: string;
    @Input() lastName: string;
    @Input() middleInitial: string;
  constructor(private modalController:ModalController) {}
  dismiss() {
    // using the injected ModalController this page
    // can "dismiss" itself and optionally pass back data
    this.modalController.dismiss({
      'dismissed': true
    });
  }
}