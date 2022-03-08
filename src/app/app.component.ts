import { Component } from '@angular/core';
import { MenuController } from '@ionic/angular';
import { StorageService } from '../app/services/storage.service';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  school:any;
  constructor(
    private menu:MenuController,
    private storage: StorageService
  ) {
      if(this.storage.get('schoolId')){
        this.school = JSON.parse(this.storage.get('schoolInfo'));
      }
  }
  openSecond() {
    if(this.storage.get('schoolId')){
      this.school = JSON.parse(this.storage.get('schoolInfo'));
    }
    this.menu.enable(true, 'second');
    this.menu.open('second');
  }
  openThird() {
    this.menu.enable(true, 'third');
    this.menu.open('third');
  }
  openFourth() {
    this.menu.enable(true, 'fourth');
    this.menu.open('fourth');
  }

  closeMenu() {
    this.menu.enable(true, 'first');
    this.menu.close();
  }
  backMenu() {
    this.closeMenu();
    this.menu.enable(true, 'first');
    this.menu.open('first');
  }
}
