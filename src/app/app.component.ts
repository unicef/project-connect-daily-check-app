import { Component } from '@angular/core';
import { MenuController } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  constructor(
    private menu:MenuController
  ) {
    
  }
  openSecond() {
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
