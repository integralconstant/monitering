/* Educational care guidance selected from the displayed analysis grades. */
function buildCarePlan(result) {
  const note = '사진 분석 등급과 피지 유무에 맞춘 생활 관리 안내예요. 진단이나 치료를 대신하지 않아요. 붉어짐·부기·심한 가려움이 계속되면 피부과에서 확인해 주세요.';
  const sources = [
    { title: '미국피부과학회 · 건강한 모발 관리', url: 'https://www.aad.org/public/everyday-care/hair-scalp-care/hair/healthy-hair-tips' },
    { title: '미국피부과학회 · 탈모 시 모발 관리', url: 'https://www.aad.org/public/diseases/hair-loss/treatment/tips/' },
    { title: '영국 NHS · 비듬과 두피 증상', url: 'https://www.nhs.uk/conditions/dandruff/' }
  ];
  if (!result || !Array.isArray(result.metrics)) return { items: [], sources, note };
  const observed = result.metrics.filter(metric => {
    const expected = { flakes: 4, sebum: 3, hair_loss: 3, erythema: 3 }[metric?.id];
    return expected && Array.isArray(metric.probabilities) && metric.probabilities.length === expected
      && metricGrade(metric) !== null;
  });
  if (!observed.length) return { items: [], sources, note };
  const items = [
    { id: 'gentle-wash', metric_id: null, title: '두피 위주로 부드럽게 씻기', text: '두피가 기름지거나 더러워지는 정도에 맞춰 씻고, 샴푸는 두피 위주로 사용해요.', reason: '모든 등급에서 살펴볼 기본 습관이에요.' },
    { id: 'low-heat', metric_id: null, title: '수건과 드라이어는 부드럽게', text: '수건으로 물기를 부드럽게 흡수하고, 드라이어를 쓴다면 낮은 온도로 사용해요.', reason: '모발에 가해지는 마찰과 열을 줄여요.' },
    { id: 'observe', metric_id: null, title: '같은 조건으로 다음 기록 남기기', text: '같은 부위와 비슷한 조명에서 사진을 남겨요. 가려움이나 붉어짐 등 직접 느낀 변화도 함께 살펴봐 주세요.', reason: '사진의 분석 등급만으로 상태 변화를 단정하지 않아요.' }
  ];
  const guidance = {
    flakes: { id: 'flakes-care', title: '각질과 가려움의 경과 살펴보기', text: '지금의 세정 주기와 사용 제품을 돌아봐 주세요. 각질이나 가려움이 심하거나 계속되면 피부과에서 원인을 확인해요.' },
    sebum: { id: 'sebum-care', title: '기름지는 정도에 맞춰 씻기', text: '일률적으로 세정 횟수를 정하기보다, 두피가 더러워지거나 기름지는 정도에 맞춰 세정 주기를 조절해요.' },
    hair_loss: { id: 'hair-care', title: '모발에 가해지는 힘 줄이기', text: '젖은 머리카락은 조심스럽게 다루고, 당기거나 거칠게 문지르는 습관을 줄여 주세요. 실제 빠지는 양이 걱정되면 피부과에서 확인해요.' },
    erythema: { id: 'redness-care', title: '실제 붉어짐과 불편감 확인하기', text: '사진의 붉은 기가 실제 두피에서도 보이는지 살펴봐 주세요. 붉어짐이나 부기, 심한 가려움이 있으면 피부과에서 확인해요.' }
  };
  const elevated = observed.filter(metric => metricGrade(metric) > 0)
    .sort((a, b) => metricGrade(b) - metricGrade(a));
  const used = new Set();
  for (const metric of elevated) {
    if (used.has(metric.id)) continue;
    used.add(metric.id);
    const guide = guidance[metric.id];
    items.push({ ...guide, metric_id: metric.id,
      reason: isBinarySebum(metric) ? '피지 유무 항목에서 유로 분류되어 추가한 안내예요.' : `${metricName(metric)} 항목이 ${metricLabel(metric)} 등급으로 분류되어 추가한 안내예요.` });
  }
  return { items, sources, note };
}
