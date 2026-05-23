import { animate, style, transition, trigger } from '@angular/animations';

const EASE_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const slideUpAnimation = trigger('slideUp', [
  transition(':enter', [
    style({ height: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate('220ms ease-in', style({ height: '0px', opacity: 0 })),
  ]),
]);

export const slideInLeftAnimation = trigger('slideInLeft', [
  transition(':enter', [
    style({ width: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ width: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate('220ms ease-in', style({ width: '0px', opacity: 0 })),
  ]),
]);

export const slideInRightAnimation = trigger('slideInRight', [
  transition(':enter', [
    style({ width: '0px', opacity: 0 }),
    animate(`320ms ${EASE_SPRING}`, style({ width: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate('220ms ease-in', style({ width: '0px', opacity: 0 })),
  ]),
]);
