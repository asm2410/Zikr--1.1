export type Dhikr = {
  id: string;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  target: number;
  virtue: string;
  reward: string;
};

export const adhkar: Dhikr[] = [
  {
    id: 'subhanallah',
    title: 'سبحان الله',
    arabic: 'سُبْحَانَ اللَّهِ',
    transliteration: 'Subḥān Allāh',
    translation: 'سبحان الله وبحمده',
    target: 33,
    virtue: 'كلمتان خفيفتان على اللسان، ثقيلتان في الميزان',
    reward: 'غُرست له نخلة في الجنة',
  },
  {
    id: 'alhamdulillah',
    title: 'الحمد لله',
    arabic: 'الْحَمْدُ لِلَّهِ',
    transliteration: 'Al-ḥamdu lillāh',
    translation: 'الحمد لله رب العالمين',
    target: 33,
    virtue: 'تملأ الميزان',
    reward: 'أحب الكلام إلى الله',
  },
  {
    id: 'allahu-akbar',
    title: 'الله أكبر',
    arabic: 'اللَّهُ أَكْبَرُ',
    transliteration: 'Allāhu Akbar',
    translation: 'الله أكبر من كل شيء',
    target: 34,
    virtue: 'تكمل المئة',
    reward: 'غُفرت خطاياه وإن كانت مثل زبد البحر',
  },
  {
    id: 'la-ilaha-illa-allah',
    title: 'لا إله إلا الله',
    arabic: 'لَا إِلَهَ إِلَّا اللَّهُ',
    transliteration: 'Lā ilāha illā Allāh',
    translation: 'لا إله إلا الله وحده لا شريك له',
    target: 100,
    virtue: 'أفضل الذكر',
    reward: 'من كان آخر كلامه دخل الجنة',
  },
  {
    id: 'istighfar',
    title: 'أستغفر الله',
    arabic: 'أَسْتَغْفِرُ اللَّهَ',
    transliteration: 'Astaghfirullāh',
    translation: 'أستغفر الله العظيم وأتوب إليه',
    target: 100,
    virtue: 'مفتاح الفرج وغفران الذنب',
    reward: 'يُرزق ويُفرج همه',
  },
  {
    id: 'salah-nabi',
    title: 'الصلاة على النبي',
    arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',
    transliteration: 'Allāhumma ṣalli ʿalā Muḥammad',
    translation: 'اللهم صلِّ وسلم على نبينا محمد',
    target: 100,
    virtue: 'من صلى علي صلاة صلى الله بها عليه عشراً',
    reward: 'أولى بشفاعته يوم القيامة',
  },
];
