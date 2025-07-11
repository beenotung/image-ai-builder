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
import { Script } from '../components/script.js'
import { Chart, ChartScript } from '../components/chart.js'

let pageTitle = <Locale en="Train AI" zh_hk="訓練 AI" zh_cn="训练 AI" />
let addPageTitle = (
  <Locale en="Add Train AI" zh_hk="添加Train AI" zh_cn="添加Train AI" />
)

let style = Style(/* css */ `
#TrainAI {

}
ion-range::part(pin) { /*always show pin number*/
  bborder-radius: 50%;
  transform: scale(1.01);
  top: -20px;
}
`)

let script = Script(/* js */ `
  //if no duplicate variable error, it should add 'let' before variable
  learning_rate = document.querySelector('#learning_rate'); 

  learning_rate.pinFormatter = (value) => {
    // Format the value to 2 decimal places
    return value.toFixed(2);
  }

  learning_rate.addEventListener('ionChange', ({ detail }) => {
    // console.log('learning rate emitted value: ' + detail.value);
  });


`)

let page = (
  <>
    {style}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/" backText="Home" />
        <ion-title role="heading" aria-level="1">
          {pageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="TrainAI" class="ion-padding">
      <h2>
        <Locale
          en="Model Training Setting"
          zh_hk="模型訓練設定"
          zh_cn="模型训练设置"
        ></Locale>
      </h2>

      <Main />
    </ion-content>
    {script}
  </>
)

let items = [
  { title: 'Android', slug: 'md' },
  { title: 'iOS', slug: 'ios' },
]

let demo_chart_label: string[] = ['1', '2', '3', '4', '5']
let demo_chart_data: number[] = [10, 15, 10, 11, 9]

function Main(attrs: {}, context: Context) {
  let user = getAuthUser(context)
  return (
    <>
      {/* <ion-list>
        {mapArray(items, item => (
          <ion-item>
            {item.title} ({item.slug})
          </ion-item>
        ))}
      </ion-list>
      {user ? (
        <Link href="/train-ai/add" tagName="ion-button">
          {addPageTitle}
        </Link>
      ) : (
        <p>
          You can add train ai after <Link href="/register">register</Link>.
        </p>
      )} */}
      <ion-item>
        <ion-label>
          <Locale en="Learning Rate:" zh_hk="學習率:" zh_cn="学习率:" />
        </ion-label>
        <ion-range
          id="learning_rate"
          step="0.01"
          pin
          ticks
          snaps
          value="0.03"
          min="0.01"
          max="0.1"
          aria-label="Custom range"
        ></ion-range>
      </ion-item>
      <ion-item>
        <ion-label>
          <Locale en="Epoch to train:" zh_hk="訓練輪數:" zh_cn="训练轮数:" />
        </ion-label>

        <ion-range
          id="epoch_no"
          step="10"
          pin
          ticks
          snaps
          value="20"
          min="0"
          max="100"
          aria-label="Custom range"
        ></ion-range>
      </ion-item>

      {user ? (
        <Link href="/train-ai/train" tagName="ion-button">
          {<Locale en="Train AI" zh_hk="訓練 AI" zh_cn="训练 AI" />}
        </Link>
      ) : (
        <p>
          You can train ai after <Link href="/register">register</Link>.
        </p>
      )}
      <h2>
        <Locale
          en="Model Loss over Epoch"
          zh_hk="模型損失隨訓練輪數變化"
          zh_cn="模型损失随训练轮数变化"
        />
      </h2>
      {ChartScript}
      <div style="width: 100%; height: 400px;">
        <Chart
          canvas_id="Model Loss over Epoch"
          data_labels={demo_chart_label}
          datasets={[{ label: 'Loss', data: demo_chart_data }]}
          borderWidth={1}
          min={0}
          max={9}
        />
      </div>
    </>
  )
}

let addPage = (
  <>
    {Style(/* css */ `
#AddTrainAI .hint {
  margin-inline-start: 1rem;
  margin-block: 0.25rem;
}
`)}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/train-ai" backText={pageTitle} />
        <ion-title role="heading" aria-level="1">
          {addPageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="AddTrainAI" class="ion-padding">
      <form
        method="POST"
        action="/train-ai/add/submit"
        onsubmit="emitForm(event)"
      >
        <ion-list>
          <ion-item>
            <ion-input
              name="title"
              label="Title*:"
              label-placement="floating"
              required
              minlength="3"
              maxlength="50"
            />
          </ion-item>
          <p class="hint">(3-50 characters)</p>
          <ion-item>
            <ion-input
              name="slug"
              label="Slug*: (unique url)"
              label-placement="floating"
              required
              pattern="(\w|-|\.){1,32}"
            />
          </ion-item>
          <p class="hint">
            (1-32 characters of: <code>a-z A-Z 0-9 - _ .</code>)
          </p>
        </ion-list>
        <div style="margin-inline-start: 1rem">
          <ion-button type="submit">Submit</ion-button>
        </div>
        <p>
          Remark:
          <br />
          *: mandatory fields
        </p>
        <p id="add-message"></p>
      </form>
    </ion-content>
  </>
)

function AddPage(attrs: {}, context: DynamicContext) {
  let user = getAuthUser(context)
  if (!user) return <Redirect href="/login" />
  return addPage
}

let submitParser = object({
  title: string({ minLength: 3, maxLength: 50 }),
  slug: string({ match: /^[\w-]{1,32}$/ }),
})

function Submit(attrs: {}, context: DynamicContext) {
  try {
    let user = getAuthUser(context)
    if (!user) throw 'You must be logged in to submit ' + pageTitle
    let body = getContextFormBody(context)
    let input = submitParser.parse(body)
    let id = items.push({
      title: input.title,
      slug: input.slug,
    })
    return <Redirect href={`/train-ai/result?id=${id}`} />
  } catch (error) {
    throwIfInAPI(error, '#add-message', context)
    return (
      <Redirect
        href={
          '/train-ai/result?' + new URLSearchParams({ error: String(error) })
        }
      />
    )
  }
}

function SubmitResult(attrs: {}, context: DynamicContext) {
  let params = new URLSearchParams(context.routerMatch?.search)
  let error = params.get('error')
  let id = params.get('id')
  return (
    <>
      <ion-header>
        <ion-toolbar>
          <IonBackButton href="/train-ai/add" backText="Form" />
          <ion-title role="heading" aria-level="1">
            Submitted {pageTitle}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content id="AddTrainAI" class="ion-padding">
        {error ? (
          renderError(error, context)
        ) : (
          <>
            <p>Your submission is received (#{id}).</p>
            <Link href="/train-ai" tagName="ion-button">
              Back to {pageTitle}
            </Link>
          </>
        )}
      </ion-content>
    </>
  )
}

let routes = {
  '/train-ai': {
    resolve(context) {
      let t = evalLocale(pageTitle, context)
      return {
        title: title(t),
        description: 'TODO',
        node: page,
      }
    },
  },
  '/train-ai/add': {
    title: title(addPageTitle),
    description: 'TODO',
    node: <AddPage />,
    streaming: false,
  },
  '/train-ai/add/submit': {
    title: apiEndpointTitle,
    description: 'TODO',
    node: <Submit />,
    streaming: false,
  },
  '/train-ai/result': {
    title: apiEndpointTitle,
    description: 'TODO',
    node: <SubmitResult />,
    streaming: false,
  },
  '/train-ai/train': {
    title: title(addPageTitle),
    description: 'TODO',
    node: <AddPage />,
    streaming: false,
  },
} satisfies Routes

export default { routes }
