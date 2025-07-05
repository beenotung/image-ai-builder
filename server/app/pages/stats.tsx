import { count } from 'better-sqlite3-proxy'
import { o } from '../jsx/jsx.js'
import { Routes } from '../routes.js'
import { apiEndpointTitle, title } from '../../config.js'
import Style from '../components/style.js'
import {
  Context,
  DynamicContext,
  getContextFormBody,
  throwIfInAPI,
} from '../context.js'
import { mapArray } from '../components/fragment.js'
import { IonBackButton } from '../components/ion-back-button.js'
import { object, string } from 'cast.ts'
import { Link, Redirect } from '../components/router.js'
import { renderError } from '../components/error.js'
import { getAuthUser } from '../auth/user.js'
import { evalLocale, Locale } from '../components/locale.js'
import { proxy } from '../../../db/proxy.js'

let pageTitle = <Locale en="Stats Data" zh_hk="统计数据" zh_cn="统计数据" />

let style = Style(/* css */ `
#Stats {
}
.stats-label-count {
  color: var(--ion-color-primary);
  text-decoration: underline;
  text-decoration-color: var(--ion-color-primary);
  text-decoration-thickness: 0.125rem;
  text-underline-offset: 0.25rem;
}
.stats-item {
  margin-bottom: 1.5rem;
}
.stats-label {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.stats-chart {
  display: flex;
  flex-direction: row;
  border-radius: 0.5rem;
  overflow: hidden;
}
.stats-chart--bar {
  padding: 0.5rem;
  text-align: center;
}
.stats-chart--bar[data-label="yes"] {
  background-color: green;
  color: white;
  border-top-left-radius: 0.5rem;
  border-bottom-left-radius: 0.5rem;
}
.stats-chart--bar[data-label="unknown"] {
  background-color: lightgray;
  color: black;
}
.stats-chart--bar[data-label="no"] {
  background-color: red;
  color: white;
  border-top-right-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}
`)

let page = (
  <>
    {style}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/" />
        <ion-title role="heading" aria-level="1">
          {pageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="Stats" class="ion-no-padding" color="light">
      <Main />
    </ion-content>
  </>
)

function Main(attrs: {}, context: Context) {
  let user = getAuthUser(context)
  let totalCount = <span class="stats-label-count">{proxy.label.length}</span>
  return (
    <>
      <h2 class="ion-padding-horizontal">
        <ion-icon name="stats-chart" />{' '}
        <Locale
          en={<>Total {totalCount} types of labels</>}
          zh_hk={<>總共 {totalCount} 種標籤</>}
          zh_cn={<>总共 {totalCount} 种标签</>}
        />
      </h2>
      {mapArray(proxy.label, label => {
        let label_id = label.id!
        count(proxy.image_label, { label_id })
        let yes = Math.floor(Math.random() * 100)
        let unknown = Math.floor(Math.random() * 100)
        let no = Math.floor(Math.random() * 100)
        return (
          <ion-card class="stats-item">
            <ion-card-content>
              <div class="stats-label">{label.title}</div>
              <StatsChart yes={yes} unknown={unknown} no={no} />
            </ion-card-content>
          </ion-card>
        )
      })}
    </>
  )
}

function StatsChart(attrs: { yes: number; unknown: number; no: number }) {
  let { yes, unknown, no } = attrs
  return (
    <div class="stats-chart">
      <div class="stats-chart--bar" data-label="yes" style={`flex: ${yes};`}>
        {yes}
      </div>
      <div
        class="stats-chart--bar"
        data-label="unknown"
        style={`flex: ${unknown};`}
      >
        {unknown}
      </div>
      <div class="stats-chart--bar" data-label="no" style={`flex: ${no};`}>
        {no}
      </div>
    </div>
  )
}

let routes = {
  '/stats': {
    resolve(context) {
      let t = evalLocale(pageTitle, context)
      return {
        title: title(t),
        description: 'TODO',
        node: page,
      }
    },
  },
} satisfies Routes

export default { routes }
