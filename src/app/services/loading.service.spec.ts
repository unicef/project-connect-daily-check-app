import { TestBed } from '@angular/core/testing';
import { LoadingController } from '@ionic/angular';

import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;
  let controller: jasmine.SpyObj<LoadingController>;

  beforeEach(() => {
    controller = jasmine.createSpyObj<LoadingController>('LoadingController', [
      'create',
      'dismiss',
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: LoadingController, useValue: controller }],
    });
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('closes the open loader', async () => {
    controller.dismiss.and.resolveTo(true);

    await service.dismiss();

    expect(controller.dismiss).toHaveBeenCalledTimes(1);
    expect(service.isStillLoading()).toBeFalse();
  });

  it('does nothing when no loader is open', async () => {
    // What Ionic does when there is nothing to close.
    controller.dismiss.and.rejectWith(new Error('overlay does not exist'));

    await expectAsync(service.dismiss()).toBeResolved();
    expect(service.isStillLoading()).toBeFalse();
  });

  it('closes a loader that finishes opening after it was dismissed', async () => {
    let opened: () => void;
    const loader = {
      present: () => new Promise<void>((resolve) => (opened = resolve)),
      dismiss: jasmine.createSpy('dismiss').and.resolveTo(true),
    };
    controller.create.and.resolveTo(loader as any);
    controller.dismiss.and.rejectWith(new Error('overlay does not exist'));

    await service.present('Loading');
    await service.dismiss();
    opened();
    await new Promise((resolve) => setTimeout(resolve));

    expect(loader.dismiss).toHaveBeenCalledTimes(1);
  });
});
