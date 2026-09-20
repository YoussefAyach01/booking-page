import { toHHmm } from './time.ts';

export type Lang = 'fr' | 'ar';

const DICT = {
  fr: {
    title: 'Prendre rendez-vous',
    service: '1. Choisissez une prestation',
    date: '2. Choisissez un jour',
    time: '3. Choisissez une heure',
    you: '4. Vos coordonnées',
    name: 'Votre nom',
    phone: 'Téléphone (WhatsApp)',
    note: 'Remarque (facultatif)',
    book: 'Réserver ce créneau',
    pickSlot: 'Choisissez d’abord une prestation et un jour.',
    loading: 'Chargement des créneaux…',
    noSlots: 'Aucun créneau libre ce jour-là. Essayez un autre jour.',
    slotsError: 'Impossible de charger les créneaux. Réessayez.',
    minutes: 'min',
    mad: 'MAD',
    status_pending: 'En attente de confirmation',
    status_confirmed: 'Confirmé',
    status_cancelled: 'Annulé',
    thanks: 'Demande envoyée',
    thanksText: 'Envoyez-nous le message WhatsApp pour que nous confirmions votre rendez-vous.',
    wa: 'Confirmer sur WhatsApp',
    cancel: 'Annuler mon rendez-vous',
    cancelled: 'Votre rendez-vous est annulé.',
    another: 'Prendre un autre rendez-vous',
    at: 'à',
    lang: 'العربية',
    langLabel: 'Afficher la page en arabe',
    keep: 'Conservez cette page : elle vous permet d’annuler.',
    hello: 'Bonjour',
    waBook: 'je souhaite confirmer mon rendez-vous',
    with: 'pour',
    on: 'le',
    nameLabel: 'Nom',
    e_slot_unavailable: 'Ce créneau vient d’être pris. Choisissez-en un autre.',
    e_too_many_bookings: 'Vous avez déjà 3 rendez-vous à venir. Annulez-en un ou appelez-nous.',
    e_invalid: 'Vérifiez le formulaire : nom, numéro WhatsApp marocain (ex. 0612345678), jour et heure.',
    e_rate: 'Trop de demandes. Réessayez dans quelques minutes.',
    e_service_not_found: 'Cette prestation n’est plus disponible.',
    e_already_started: 'Ce rendez-vous a déjà commencé, il ne peut plus être annulé en ligne.',
    noServices: 'Ce salon n’a pas encore configuré ses prestations.',
  },
  ar: {
    title: 'احجز موعدك',
    service: '1. اختر الخدمة',
    date: '2. اختر اليوم',
    time: '3. اختر الساعة',
    you: '4. معلوماتك',
    name: 'الاسم',
    phone: 'الهاتف (واتساب)',
    note: 'ملاحظة (اختياري)',
    book: 'احجز هذا الموعد',
    pickSlot: 'اختر الخدمة واليوم أولاً.',
    loading: 'جارٍ تحميل المواعيد…',
    noSlots: 'لا توجد مواعيد شاغرة في هذا اليوم. جرّب يوماً آخر.',
    slotsError: 'تعذر تحميل المواعيد. أعد المحاولة.',
    minutes: 'د',
    mad: 'درهم',
    status_pending: 'في انتظار التأكيد',
    status_confirmed: 'مؤكد',
    status_cancelled: 'ملغى',
    thanks: 'تم إرسال الطلب',
    thanksText: 'أرسل لنا رسالة واتساب لنؤكد موعدك.',
    wa: 'التأكيد عبر واتساب',
    cancel: 'إلغاء موعدي',
    cancelled: 'تم إلغاء موعدك.',
    another: 'احجز موعداً آخر',
    at: 'على الساعة',
    lang: 'Français',
    langLabel: 'عرض الصفحة بالفرنسية',
    keep: 'احتفظ بهذه الصفحة: تتيح لك إلغاء الموعد.',
    hello: 'السلام عليكم',
    waBook: 'أريد تأكيد موعدي',
    with: 'لـ',
    on: 'يوم',
    nameLabel: 'الاسم',
    e_slot_unavailable: 'تم حجز هذا الموعد للتو. اختر موعداً آخر.',
    e_too_many_bookings: 'لديك 3 مواعيد قادمة بالفعل. ألغِ أحدها أو اتصل بنا.',
    e_invalid: 'راجع النموذج: الاسم ورقم واتساب مغربي (مثال 0612345678) واليوم والساعة.',
    e_rate: 'طلبات كثيرة. أعد المحاولة بعد دقائق.',
    e_service_not_found: 'هذه الخدمة لم تعد متاحة.',
    e_already_started: 'بدأ هذا الموعد بالفعل ولا يمكن إلغاؤه عبر الإنترنت.',
    noServices: 'لم يقم هذا الصالون بإعداد خدماته بعد.',
  },
} as const;

export type Key = keyof (typeof DICT)['fr'];
export const t = (lang: Lang, key: Key): string => DICT[lang][key];

export function formatDay(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export const formatTime = (minutes: number): string => toHHmm(minutes);

/** Message the customer sends to the salon to confirm a booking. */
export function customerMessage(
  lang: Lang,
  b: { customerName: string; serviceName: string; date: string; startMin: number },
): string {
  return `${t(lang, 'hello')}, ${t(lang, 'waBook')}\n${t(lang, 'nameLabel')}: ${b.customerName}\n${b.serviceName} ${t(lang, 'on')} ${formatDay(b.date, lang)} ${t(lang, 'at')} ${toHHmm(b.startMin)}`;
}

/** Message the salon sends to a customer once the booking is confirmed (French: local default for staff). */
export function salonConfirmMessage(
  salonName: string,
  b: { customerName: string; serviceName: string; date: string; startMin: number },
): string {
  return `Bonjour ${b.customerName}, votre rendez-vous chez ${salonName} est confirmé : ${b.serviceName}, ${formatDay(b.date, 'fr')} à ${toHHmm(b.startMin)}. À bientôt !`;
}
